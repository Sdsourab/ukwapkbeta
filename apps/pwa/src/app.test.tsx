// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { act } from 'react';
import { DataStore } from '@ukw/database';
import { captureAnchor } from '@ukw/anchor-engine';
import { App } from './App';
import { StoreProvider } from './store-context';
import { byText, click, flush, key, mount, q, qa, typeInto, waitFor, type Mounted } from '../../../tests/react-utils';

// React Flow needs browser layout APIs jsdom lacks; the editor's data logic is covered in database/graph-engine tests.
vi.mock('./screens/GraphEditor', () => ({ default: () => <div data-testid="graph-editor-stub" /> }));

let store: DataStore;
let mounted: Mounted | null = null;
let n = 0;

async function renderApp(path = '/') {
  store = await new DataStore({ name: `pwa-test-${++n}-${Math.random()}`, broadcast: false }).open();
  return { store, mount: async () => { mounted = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></StoreProvider>); return mounted; } };
}

beforeEach(() => {
  window.scrollTo = vi.fn() as never;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => {
  await mounted?.unmount();
  mounted = null;
  store?.close();
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('data-ukw-theme');
  vi.restoreAllMocks();
});

const CONTENT = 'Reading research shows that attention drifts during long passages.\n\nParticipants who highlighted key sentences recalled more details after one week.\n\nThe authors recommend selective marking combined with brief notes.';

async function selectText(el: Node, from: number, to: number) {
  const range = document.createRange();
  range.setStart(el, from);
  range.setEnd(el, to);
  const sel = window.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(range);
  await act(async () => { document.dispatchEvent(new Event('selectionchange')); await new Promise((r) => setTimeout(r, 160)); });
}

describe('Library', () => {
  it('shows an empty state, then lists sources with counts, filters and favorites', async () => {
    const t = await renderApp('/');
    await t.mount();
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('Your library is empty'));

    const a = await store.documents.upsertFromPage({ url: 'https://alpha.example/one', title: 'Alpha paper' });
    await store.documents.upsertFromPage({ url: 'https://beta.example/two', title: 'Beta report' });
    await store.annotations.createAnnotation({ documentId: a.id, type: 'highlight', anchor: { exact: 'a quote' } });
    await waitFor(() => expect(qa('.doclink').length).toBe(2));
    expect(q('.doclink__main')?.textContent).toMatch(/highlight/);

    await typeInto(q<HTMLInputElement>('input[aria-label="Filter sources"]'), 'beta');
    await waitFor(() => expect(qa('.doclink').length).toBe(1));
    expect(q('.row__title')?.textContent).toBe('Beta report');

    await typeInto(q<HTMLInputElement>('input[aria-label="Filter sources"]'), '');
    await waitFor(() => expect(qa('.doclink').length).toBe(2));
    await click(q('button[aria-label="Add to favorites"]'));
    await waitFor(async () => expect((await store.documents.list()).filter((d) => d.isFavorite)).toHaveLength(1));
    await click(byText('button.ukw-segmented__opt', /Favorites/));
    await waitFor(() => expect(qa('.doclink').length).toBe(1));
  });

  it('bulk-archives selected sources and Undo restores them', async () => {
    const t = await renderApp('/');
    await store.documents.upsertFromPage({ url: 'https://a.example/1', title: 'One' });
    await store.documents.upsertFromPage({ url: 'https://b.example/2', title: 'Two' });
    await t.mount();
    await waitFor(() => expect(qa('.doclink').length).toBe(2));
    await click(byText('button', 'Select'));
    await waitFor(() => expect(qa('input[type="checkbox"]').length).toBe(2));
    for (const cb of qa('input[type="checkbox"]')) await click(cb);
    await waitFor(() => expect(q('.bulkbar')?.textContent).toMatch(/2 selected/));
    await click(byText('.bulkbar button', 'Archive'));
    await waitFor(async () => expect((await store.documents.list()).every((d) => d.isArchived)).toBe(true));
    await waitFor(() => expect(q('.ukw-toast')?.textContent).toMatch(/Archived: 2 sources/));
    await click(q('.ukw-toast__action'));
    await waitFor(async () => expect((await store.documents.list()).every((d) => !d.isArchived)).toBe(true));
  });
});

describe('Reader and highlights', () => {
  it('selecting text creates a persisted highlight that renders as <mark>; delete + Undo round-trips (TC-ANN-01/04)', async () => {
    const t = await renderApp('/');
    const doc = await store.documents.createManual({ title: 'Reading study', content: CONTENT });
    // navigate by re-mounting at the document route
    store.close();
    store = await new DataStore({ name: store.db.name, broadcast: false }).open();
    mounted = null;
    const m = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={[`/doc/${doc.id}`]}><App /></MemoryRouter></StoreProvider>);
    mounted = m;
    void t;
    await waitFor(() => expect(qa('.reader p').length).toBe(3));

    const textNode = qa('.reader p')[1]!.firstChild!;
    await selectText(textNode, 0, 'Participants who highlighted'.length);
    await waitFor(() => expect(q('.selbar')).not.toBeNull());
    await click(byText('.selbar button', 'Highlight'));

    await waitFor(() => expect(qa('mark[data-ann]').length).toBeGreaterThan(0));
    expect(qa('mark[data-ann]').map((x) => x.textContent).join('')).toBe('Participants who highlighted');
    const stored = await store.annotations.listByDocument(doc.id);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.anchor?.exact).toBe('Participants who highlighted');
    expect(stored[0]!.status).toBe('active');
    await waitFor(() => expect(qa('.ann').length).toBe(1));

    await click(q('button[aria-label="Delete highlight"]'));
    await waitFor(() => expect(qa('mark[data-ann]').length).toBe(0));
    await click(byText('.ukw-toast__action', 'Undo'));
    await waitFor(() => expect(qa('mark[data-ann]').length).toBeGreaterThan(0));
  });

  it('flags a highlight whose passage was removed as "Location lost" and offers reattach', async () => {
    await renderApp('/');
    const doc = await store.documents.createManual({ title: 'Edited source', content: CONTENT });
    const anchor = captureAnchor(CONTENT.replace(/\n\n/g, '\n'), 0, 20)!;
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: { exact: 'Text that no longer exists in this source at all', prefix: 'zzz', suffix: 'yyy' } });
    void anchor;
    mounted = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={[`/doc/${doc.id}`]}><App /></MemoryRouter></StoreProvider>);
    await waitFor(() => expect(q('.ann')?.textContent).toMatch(/Location lost/));
    await waitFor(async () => expect((await store.annotations.listByDocument(doc.id))[0]!.status).toBe('orphaned'));
    expect(qa('mark[data-ann]').length).toBe(0);
    await click(byText('button', 'Reattach…'));
    await waitFor(() => expect(q('[role="dialog"]')?.textContent).toMatch(/No similar passage/));
  });

  it('autosaves a note on a highlight and exposes it to search', async () => {
    await renderApp('/');
    const doc = await store.documents.upsertFromPage({ url: 'https://paper.example/x', title: 'Paper' });
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: { exact: 'Working memory is limited' } });
    mounted = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={[`/doc/${doc.id}`]}><App /></MemoryRouter></StoreProvider>);
    await waitFor(() => expect(q('textarea[aria-label="Note"]')).not.toBeNull());
    await typeInto(q<HTMLTextAreaElement>('textarea[aria-label="Note"]'), 'Compare with Cowan 2001');
    await waitFor(async () => expect((await store.notes.list()).map((x) => x.body)).toContain('Compare with Cowan 2001'), 4000);
    expect((await store.search.search({ query: 'cowan' })).length).toBeGreaterThan(0);
  });

  it('exports Markdown for the source', async () => {
    await renderApp('/');
    const doc = await store.documents.upsertFromPage({ url: 'https://paper.example/md', title: 'Markdown source' });
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: { exact: 'Quoted passage' }, note: 'my note' });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    mounted = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={[`/doc/${doc.id}`]}><App /></MemoryRouter></StoreProvider>);
    await waitFor(() => expect(byText('button.tab', /Details/)).not.toBeNull());
    await click(byText('button.tab', /Details/));
    await click(byText('button', 'Copy Markdown'));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const md = writeText.mock.calls[0]![0] as string;
    expect(md).toContain('# Markdown source');
    expect(md).toContain('> Quoted passage');
    expect(md).toContain('my note');
  });
});

describe('Search', () => {
  it('finds highlights and filters by colour', async () => {
    await renderApp('/search?q=attention');
    const doc = await store.documents.upsertFromPage({ url: 'https://s.example/1', title: 'S' });
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#8FB8FF', anchor: { exact: 'Attention drifts over time' } });
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#FF9FC2', anchor: { exact: 'Attention is a limited resource' } });
    mounted = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={['/search?q=attention']}><App /></MemoryRouter></StoreProvider>);
    await waitFor(() => expect(qa('.result').length).toBe(2));
    await click(q('[aria-label="Filter by colour"] button[aria-pressed]'));
    await waitFor(() => expect(qa('.result').length).toBeLessThanOrEqual(2));
    await click(byText('[aria-label="Filter by colour"] button', 'Concept'));
    await waitFor(() => expect(qa('.result').length).toBe(1));
    expect(q('.result__title')?.textContent).toMatch(/Attention drifts/);
  });
  it('shows guidance before typing and an empty state for no results', async () => {
    const t = await renderApp('/search');
    await t.mount();
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('Find anything you saved'));
    await typeInto(q<HTMLInputElement>('input[aria-label="Search everything"]'), 'zzzzqqq');
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('No results'));
  });
});

describe('Theme, settings and command palette', () => {
  it('changing the theme applies it to the document and persists it (TC-THEME-01)', async () => {
    const t = await renderApp('/settings');
    await t.mount();
    await waitFor(() => expect(qa('[role="radiogroup"][aria-label="Theme"] [role="radio"]').length).toBe(5));
    await click(byText('[aria-label="Theme"] [role="radio"]', 'Dim'));
    await waitFor(() => expect(document.documentElement.getAttribute('data-ukw-theme')).toBe('dim'));
    expect(await store.settings.get('theme')).toBe('dim');
    await click(byText('[aria-label="Theme"] [role="radio"]', 'High contrast'));
    await waitFor(() => expect(document.documentElement.getAttribute('data-ukw-theme')).toBe('high-contrast'));
    // survives a reload (new store instance over the same database)
    const name = store.db.name;
    await mounted!.unmount(); mounted = null; store.close();
    store = await new DataStore({ name, broadcast: false }).open();
    mounted = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={['/']}><App /></MemoryRouter></StoreProvider>);
    await waitFor(() => expect(document.documentElement.getAttribute('data-ukw-theme')).toBe('high-contrast'));
  });

  it('the command palette opens with Ctrl+K, filters, and runs a command with the keyboard', async () => {
    const t = await renderApp('/');
    await t.mount();
    await key(window as unknown as Document, 'k', { ctrlKey: true });
    await waitFor(() => expect(q('.palette')).not.toBeNull());
    await typeInto(q<HTMLInputElement>('.palette__input'), 'theme: dark');
    await waitFor(() => expect(q('.palette__item')?.textContent).toMatch(/Theme: dark/));
    await key(q('.palette')!, 'Enter');
    await waitFor(async () => expect(await store.settings.get('theme')).toBe('dark'));
    expect(q('.palette')).toBeNull();
  });

  it('palette finds saved content across the workspace', async () => {
    const t = await renderApp('/');
    const doc = await store.documents.upsertFromPage({ url: 'https://p.example/a', title: 'Quokka behaviour' });
    void doc;
    await t.mount();
    await key(window as unknown as Document, 'k', { ctrlKey: true });
    await typeInto(q<HTMLInputElement>('.palette__input'), 'quokka');
    await waitFor(() => expect(byText('.palette__item', /Quokka behaviour/)).not.toBeNull());
  });

  it('undo/redo buttons reflect history and act on the store', async () => {
    const t = await renderApp('/');
    await t.mount();
    const undoBtn = () => q<HTMLButtonElement>('button[aria-label^="Undo"]')!;
    expect(undoBtn().disabled).toBe(true);
    const doc = await store.documents.createManual({ title: 'Temp' });
    void doc;
    await store.graphs.createGraph({ title: 'G' });
    await waitFor(() => expect(undoBtn().disabled).toBe(false));
    await click(undoBtn());
    await waitFor(async () => expect(await store.graphs.list()).toHaveLength(0));
    await waitFor(() => expect(q<HTMLButtonElement>('button[aria-label^="Redo"]')!.disabled).toBe(false));
  });
});

describe('Backup and import (TC-DATA-01)', () => {
  it('exports a JSON backup download containing the data', async () => {
    const t = await renderApp('/settings');
    await store.documents.upsertFromPage({ url: 'https://e.example/x', title: 'Exported doc' });
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => { blobs.push(b); return 'blob:test'; });
    URL.revokeObjectURL = vi.fn();
    const click_ = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    await t.mount();
    await waitFor(() => expect(byText('button', /Export backup/)).not.toBeNull());
    await click(byText('button', /Export backup/));
    await waitFor(() => expect(blobs).toHaveLength(1));
    expect(click_).toHaveBeenCalled();
    const json = JSON.parse(await blobs[0]!.text());
    expect(json.format).toBe('ukw-backup');
    expect(json.tables.documents.map((d: { title: string }) => d.title)).toContain('Exported doc');
  });

  it('imports a backup file (merge) and reports the summary; rejects bad files without changing anything', async () => {
    const source = await new DataStore({ name: `src-${Math.random()}`, broadcast: false }).open();
    await source.documents.upsertFromPage({ url: 'https://imp.example/a', title: 'Imported doc' });
    const backup = await source.exportBackup();
    source.close();

    const t = await renderApp('/settings');
    await t.mount();
    await waitFor(() => expect(q('input[type="file"]')).not.toBeNull());
    const input = q<HTMLInputElement>('input[type="file"][accept*="json"]')!;
    const setFile = async (content: string) => {
      const file = new File([content], 'backup.json', { type: 'application/json' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); await new Promise((r) => setTimeout(r, 30)); });
    };
    await setFile(JSON.stringify(backup));
    await waitFor(() => expect(q('[role="dialog"]')?.textContent).toMatch(/Import backup/));
    await click(byText('[role="dialog"] button', 'Merge'));
    await waitFor(() => expect(q('[role="dialog"]')?.textContent).toMatch(/Import complete/));
    expect((await store.documents.list()).map((d) => d.title)).toContain('Imported doc');
    await click(byText('[role="dialog"] button', 'Done'));

    await setFile(JSON.stringify({ format: 'ukw-backup', schemaVersion: 1, tables: { documents: [{ id: 'x' }] } }));
    await click(byText('[role="dialog"] button', 'Merge'));
    await waitFor(() => expect(q('[role="dialog"]')?.textContent).toMatch(/Import failed/));
    expect(q('[role="dialog"]')?.textContent).toMatch(/Nothing was changed/);
    expect((await store.documents.list()).length).toBe(1);
    await click(byText('[role="dialog"] button', 'Done'));

    await setFile('{ not json');
    await waitFor(() => expect(q('.ukw-toast')?.textContent).toMatch(/not valid JSON/));
  });

  it('Trash: restore and permanent delete with confirmation', async () => {
    const t = await renderApp('/settings');
    const d1 = await store.documents.upsertFromPage({ url: 'https://t.example/1', title: 'Trashed one' });
    const d2 = await store.documents.upsertFromPage({ url: 'https://t.example/2', title: 'Trashed two' });
    await store.documents.remove(d1.id);
    await store.documents.remove(d2.id);
    await t.mount();
    await waitFor(() => expect(byText('.row__title', 'Trashed one')).not.toBeNull());
    await click(byText('button', 'Restore'));
    await waitFor(async () => expect((await store.listTrash()).length).toBe(1));
    await waitFor(() => expect(qa('button[aria-label$="permanently"]').length).toBe(1)); // list refreshed
    await click(q('button[aria-label$="permanently"]'));
    await waitFor(() => expect(q('[role="dialog"]')?.textContent).toMatch(/cannot be recovered/));
    await click(byText('[role="dialog"] button', 'Delete forever'));
    await waitFor(async () => expect(await store.listTrash()).toHaveLength(0));
  });
});

describe('Quick capture', () => {
  it('saves a link with a quote as a source with a highlight and opens it', async () => {
    const t = await renderApp('/');
    await t.mount();
    await click(q('button.fab'));
    await waitFor(() => expect(q('[role="dialog"]')).not.toBeNull());
    await click(byText('[role="radio"]', /Link/));
    await typeInto(q<HTMLInputElement>('input[inputmode="url"]'), 'https://news.example/story?utm_source=x');
    const areas = qa<HTMLTextAreaElement>('[role="dialog"] textarea');
    await typeInto(areas[0]!, 'The key claim of the story');
    await click(byText('[role="dialog"] button', 'Save'));
    await waitFor(async () => expect(await store.documents.list()).toHaveLength(1));
    const docs = await store.documents.list();
    expect(docs[0]!.normalizedUrl).toBe('https://news.example/story');
    const anns = await store.annotations.listByDocument(docs[0]!.id);
    expect(anns[0]!.anchor?.exact).toBe('The key claim of the story');
    await waitFor(() => expect(q('.doc__head h1')).not.toBeNull());
  });

  it('rejects an invalid address with a helpful message and saves nothing', async () => {
    const t = await renderApp('/');
    await t.mount();
    await click(q('button.fab'));
    await click(byText('[role="radio"]', /Link/));
    await typeInto(q<HTMLInputElement>('input[inputmode="url"]'), 'javascript:alert(1)');
    await click(byText('[role="dialog"] button', 'Save'));
    await waitFor(() => expect(q('[role="alert"]')?.textContent).toMatch(/http/));
    expect(await store.documents.list()).toHaveLength(0);
  });

  it('empty notes are refused', async () => {
    const t = await renderApp('/');
    await t.mount();
    await click(q('button.fab'));
    await click(byText('[role="dialog"] button', 'Save'));
    await waitFor(() => expect(q('[role="alert"]')?.textContent).toMatch(/Write something/));
    expect(await store.notes.list()).toHaveLength(0);
  });
});

describe('Organize and graphs list', () => {
  it('creates a collection and a tag shows with usage; deleting a collection leaves sources intact', async () => {
    const t = await renderApp('/organize');
    const doc = await store.documents.upsertFromPage({ url: 'https://o.example/1', title: 'Organized' });
    const tag = await store.tags.ensure('memory');
    await store.tags.attach(tag.id, 'document', doc.id);
    await t.mount();
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('No collections yet'));
    await click(byText('button', 'Create one'));
    await typeInto(q<HTMLInputElement>('[role="dialog"] input'), 'Thesis');
    await click(byText('[role="dialog"] button', 'Save'));
    await waitFor(() => expect(byText('strong', 'Thesis')).not.toBeNull());
    await waitFor(() => expect(byText('.ukw-chip__main', 'memory')).not.toBeNull());
    expect(q('section[aria-labelledby="tags-h"]')?.textContent).toMatch(/1 use/);
    await click(q('button[aria-label="Delete Thesis"]'));
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('No collections yet'));
    expect(await store.documents.get(doc.id)).toBeDefined();
  });

  it('lists graphs and creates one from a template', async () => {
    const t = await renderApp('/graphs');
    await t.mount();
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('No graphs yet'));
    await click(byText('button', 'Create a graph'));
    await click(byText('[role="dialog"] [role="radio"]', /Claim & evidence/));
    await click(byText('[role="dialog"] button', 'Create'));
    await waitFor(async () => { const gs = await store.graphs.list(); expect(gs).toHaveLength(1); expect((await store.graphs.load(gs[0]!.id)).nodes).toHaveLength(4); });
    const g = (await store.graphs.list())[0]!;
    expect((await store.graphs.load(g.id)).edges).toHaveLength(3);
    await waitFor(() => expect(q('[data-testid="graph-editor-stub"]')).not.toBeNull());
  });
});

describe('Research workspace', () => {
  it('creates a project, adds a reference and renders an APA citation', async () => {
    const t = await renderApp('/research');
    await t.mount();
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('No research projects yet'));
    await click(byText('button', 'Start a project'));
    await typeInto(q<HTMLInputElement>('[role="dialog"] input'), 'Attention study');
    await click(byText('[role="dialog"] button', 'Create'));
    await waitFor(() => expect(q('input[aria-label="Project title"]')).not.toBeNull());
    await click(byText('button.tab', 'References'));
    await click(byText('button', 'Add reference'));
    await typeInto(q<HTMLInputElement>('[role="dialog"] input'), 'Highlighting and recall');
    const inputs = qa<HTMLInputElement>('[role="dialog"] input');
    await typeInto(inputs[1]!, 'Rahman, Sara; Lee, Min');
    await typeInto(inputs.find((i) => i.inputMode === 'numeric')!, '2021');
    await click(byText('[role="dialog"] button', 'Save'));
    await waitFor(() => expect(q('article.card')?.textContent).toMatch(/Rahman, S\., & Lee, M\. \(2021\)\. Highlighting and recall\./));
    expect((await store.references.list())[0]!.authors).toEqual([{ family: 'Rahman', given: 'Sara' }, { family: 'Lee', given: 'Min' }]);
  });
});

describe('boot resilience', () => {
  it('a thrown store error is surfaced by the query hook as an error state', async () => {
    const t = await renderApp('/');
    vi.spyOn(store.documents, 'list').mockRejectedValue(new Error('disk on fire'));
    await t.mount();
    await waitFor(() => expect(q('[role="alert"]')?.textContent).toMatch(/disk on fire/));
    await flush(0);
  });
});


import { scoreCommand } from './components/CommandPalette';

describe('scoreCommand', () => {
  it('ranks title matches above keyword-only matches', () => {
    const dark = { title: 'Theme: dark', group: 'Appearance', keywords: 'appearance mode dark light' };
    const light = { title: 'Theme: light', group: 'Appearance', keywords: 'appearance mode dark light' };
    expect(scoreCommand(dark, 'theme: dark')).toBeGreaterThan(scoreCommand(light, 'theme: dark'));
    expect(scoreCommand(light, 'theme: dark')).toBe(1); // only matches through hidden keywords
    expect(scoreCommand(dark, 'zzz')).toBe(0);
    expect(scoreCommand(dark, '')).toBe(1);
    expect(scoreCommand({ title: 'Undo', group: 'Edit' }, 'edit')).toBe(2);
  });
});

describe('Trash resilience', () => {
  it('a stale "Delete forever" on an already-restored item shows an error toast instead of failing silently', async () => {
    const t = await renderApp('/settings');
    const d = await store.documents.upsertFromPage({ url: 'https://stale.example/1', title: 'Stale item' });
    await store.documents.remove(d.id);
    await t.mount();
    await waitFor(() => expect(qa('button[aria-label$="permanently"]').length).toBe(1));
    await click(q('button[aria-label$="permanently"]'));
    await store.documents.restore(d.id); // restored elsewhere while the confirm dialog is open
    await click(byText('[role="dialog"] button', 'Delete forever'));
    await waitFor(() => expect(q('.ukw-toast--error')?.textContent).toMatch(/Only items in Trash/));
    expect(await store.documents.get(d.id)).toBeDefined(); // nothing was destroyed
  });
});
