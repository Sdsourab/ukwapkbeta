// @vitest-environment jsdom
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { DataStore } from '@ukw/database';
import { App } from './App';
import { StoreProvider } from './store-context';
import { byText, click, key, mount, q, waitFor, type Mounted } from '../../../tests/react-utils';

vi.mock('./screens/GraphEditor', () => ({ default: () => <main aria-label="Graph editor stub" /> }));

let store: DataStore;
let m: Mounted | null = null;
let n = 0;

beforeEach(() => { window.scrollTo = vi.fn() as never; Element.prototype.scrollIntoView = vi.fn(); });
afterEach(async () => { await m?.unmount(); m = null; store?.close(); document.body.innerHTML = ''; });

async function open(path: string) {
  m = await mount(<StoreProvider store={store}><MemoryRouter initialEntries={[path]}><App /></MemoryRouter></StoreProvider>);
}

/** WCAG 2.x A/AA rules via axe-core. color-contrast needs real layout (jsdom has none): tokens.test.ts verifies contrast. */
async function audit(label: string, context: Element | Document = document.body) {
  const result = await axe.run(context as Element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'] }, rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } });
  const summary = result.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((nd) => nd.target.join(' ')).join(' | ')}`);
  expect(summary, `${label}: accessibility violations`).toEqual([]);
}

async function seed() {
  store = await new DataStore({ name: `a11y-${++n}-${Math.random()}`, broadcast: false }).open();
  const web = await store.documents.upsertFromPage({ url: 'https://example.com/paper', title: 'A web paper' });
  const manual = await store.documents.createManual({ title: 'My reading', content: 'First paragraph about attention.\n\nSecond paragraph about memory and recall.' });
  const { annotation } = await store.annotations.createAnnotation({ documentId: manual.id, type: 'highlight', colour: '#8FB8FF', anchor: { exact: 'about attention' }, note: 'a note' });
  await store.annotations.createAnnotation({ documentId: web.id, type: 'highlight', anchor: { exact: 'a web quote' } });
  const tag = await store.tags.ensure('memory');
  await store.tags.attach(tag.id, 'document', manual.id);
  const col = await store.collections.createCollection({ name: 'Thesis' });
  await store.collections.addItem(col.id, 'document', manual.id);
  await store.graphs.createGraph({ template: 'concept-map' });
  const p = await store.projects.createProject({ title: 'Attention study' });
  await store.references.createReference({ title: 'Highlighting and recall', projectId: p.id, authors: [{ family: 'Rahman', given: 'S' }], year: 2021 });
  await store.tasks.createTask({ title: 'Read chapter 2', projectId: p.id });
  return { web, manual, annotation, project: p };
}

describe('accessibility (axe-core, WCAG 2.1 A/AA)', () => {
  it('library (populated, selection mode)', async () => {
    await seed(); await open('/');
    await waitFor(() => expect(document.querySelectorAll('.doclink').length).toBe(2));
    await audit('library');
    await click(byText('button', 'Select'));
    await audit('library selection mode');
  });
  it('empty library', async () => {
    store = await new DataStore({ name: `a11y-empty-${++n}`, broadcast: false }).open();
    await open('/');
    await waitFor(() => expect(q('.ukw-empty')).not.toBeNull());
    await audit('empty library');
  });
  it('reader with highlights, notes panel, details panel', async () => {
    const s = await seed(); await open(`/doc/${s.manual.id}`);
    await waitFor(() => expect(document.querySelectorAll('mark[data-ann]').length).toBeGreaterThan(0));
    await audit('reader');
    await click(byText('button.tab', /Notes/));
    await audit('reader notes tab');
    await click(byText('button.tab', /Details/));
    await audit('reader details tab');
  });
  it('web source detail', async () => {
    const s = await seed(); await open(`/doc/${s.web.id}`);
    await waitFor(() => expect(q('.doc__head h1')).not.toBeNull());
    await audit('web source');
  });
  it('search with results and filters', async () => {
    await seed(); await open('/search?q=attention');
    await waitFor(() => expect(document.querySelectorAll('.result').length).toBeGreaterThan(0));
    await audit('search');
  });
  it('graphs list and new-graph dialog', async () => {
    await seed(); await open('/graphs');
    await waitFor(() => expect(q('.doclink')).not.toBeNull());
    await audit('graphs');
    await click(byText('button', 'New graph'));
    await waitFor(() => expect(q('[role="dialog"]')).not.toBeNull());
    await audit('new graph dialog');
  });
  it('organize', async () => {
    await seed(); await open('/organize');
    await waitFor(() => expect(byText('strong', 'Thesis')).not.toBeNull());
    await audit('organize');
  });
  it('research project: overview, references, matrices, tasks', async () => {
    const s = await seed(); await open(`/research/${s.project.id}`);
    await waitFor(() => expect(q('input[aria-label="Project title"]')).not.toBeNull());
    await audit('research overview');
    for (const tab of ['References', 'Matrices', 'Tasks', 'Sources']) {
      await click(byText('button.tab', tab));
      await audit(`research ${tab}`);
    }
  });
  it('settings', async () => {
    await seed(); await open('/settings');
    await waitFor(() => expect(q('#ap-h')).not.toBeNull());
    await audit('settings');
  });
  it('quick capture dialog and command palette', async () => {
    await seed(); await open('/');
    await waitFor(() => expect(q('button.fab')).not.toBeNull());
    await click(q('button.fab'));
    await waitFor(() => expect(q('[role="dialog"]')).not.toBeNull());
    await audit('quick capture');
    await key(document, 'Escape');
    await key(window as unknown as Document, 'k', { ctrlKey: true });
    await waitFor(() => expect(q('.palette')).not.toBeNull());
    await audit('command palette');
  });
});
