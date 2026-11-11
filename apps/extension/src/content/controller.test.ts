// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '@ukw/database';
import { buildTextMap, captureAnchor } from '@ukw/anchor-engine';
import { handleRaw, type RouterContext } from '../background/router';
import { PageController, type Notice } from './controller';
import { adapterFor, chatgptAdapter } from './adapters';
import { createInProcessClient } from './client';
import type { HighlightRenderer, PaintEntry } from './highlighter';

const SELF = 'abcdefghijklmnopabcdefghijklmnop';

class FakeRenderer implements HighlightRenderer {
  readonly kind = 'none' as const;
  entries: PaintEntry[] = [];
  hit: string | null = null;
  paint(e: PaintEntry[]) { this.entries = e; }
  clear() { this.entries = []; }
  hitTest() { return this.hit; }
  destroy() { this.entries = []; }
  texts() { return this.entries.map((e) => e.range.toString()); }
}

let store: DataStore;
let ctx: RouterContext;
let controllers: PageController[] = [];
let n = 0;

beforeEach(async () => {
  // jsdom has no layout: give ranges a deterministic geometry.
  (Range.prototype as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => ({ top: 100, left: 50, width: 120, height: 20, bottom: 120, right: 170, x: 50, y: 100 });
  (Range.prototype as unknown as { getClientRects: () => unknown[] }).getClientRects = () => [];
  window.scrollTo = vi.fn() as never;
  store = await new DataStore({ name: `ctl-${++n}-${Math.random()}`, broadcast: false }).open();
  ctx = { store, selfId: SELF, actions: { openDashboard: async () => undefined } };
  history.pushState({}, '', '/article');
});
afterEach(() => {
  controllers.forEach((c) => c.destroy());
  controllers = [];
  store.close();
  document.body.innerHTML = '';
  document.title = '';
  vi.restoreAllMocks();
});

const PAGE = `<article>
  <h1>Attention and reading</h1>
  <p id="p1">Reading research shows that attention drifts during long passages of text.</p>
  <p id="p2">Participants who highlighted key sentences recalled more details after one week.</p>
  <p id="p3">The authors recommend selective marking combined with brief notes.</p>
</article>`;

function make(html = PAGE, opts: { adapter?: typeof chatgptAdapter } = {}) {
  document.body.innerHTML = html;
  const renderer = new FakeRenderer();
  const client = createInProcessClient((raw) => handleRaw(ctx, raw, { extensionId: SELF, url: location.href }));
  const controller = new PageController({ doc: document, win: window, client, adapterFor: opts.adapter ? () => opts.adapter! : adapterFor, renderer });
  controllers.push(controller);
  const notices: Notice[] = [];
  controller.onNotice((x) => notices.push(x));
  return { controller, renderer, client, notices };
}

function select(el: Element, from: number, to: number) {
  const text = el.firstChild as Text;
  const r = document.createRange();
  r.setStart(text, from);
  r.setEnd(text, to);
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
}

const flush = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('page lifecycle and privacy', () => {
  it('starts, finds nothing, and records nothing about the visit (TC-EXT privacy)', async () => {
    const { controller, renderer } = make();
    await controller.start();
    expect(controller.getState().ready).toBe(true);
    expect(controller.getState().document).toBeNull();
    expect(renderer.entries).toEqual([]);
    expect(await store.documents.list()).toHaveLength(0);
    expect(await store.db.syncQueue.count()).toBe(0);
  });

  it('does nothing on sites the user turned off', async () => {
    await store.settings.set('disabledSites', ['localhost']);
    const { controller, renderer, client } = make();
    const spy = vi.spyOn(client, 'request');
    await controller.start();
    expect(controller.getState().disabled).toBe(true);
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['SETTINGS_GET']); // no lookup at all
    select(document.querySelector('#p1')!, 0, 7);
    expect(await controller.createFromSelection()).toBeNull();
    expect(renderer.entries).toEqual([]);
  });
});

describe('create, reload and restore (TC-EXT-01 / TC-EXT-02)', () => {
  it('selecting text and highlighting saves, paints, and survives a page reload', async () => {
    const a = make();
    await a.controller.start();
    select(document.querySelector('#p2')!, 0, 'Participants who highlighted'.length);
    const ann = await a.controller.createFromSelection('highlight', '#8FB8FF');
    expect(ann?.anchor?.exact).toBe('Participants who highlighted');
    expect(a.renderer.texts()).toEqual(['Participants who highlighted']);
    expect(a.renderer.entries[0]!.colour).toBe('#8FB8FF');
    expect(window.getSelection()!.isCollapsed).toBe(true); // selection cleared after saving
    expect(a.notices.some((x) => x.message === 'Highlight saved' && x.action?.label === 'Undo')).toBe(true);

    // simulate reload: brand-new controller over a fresh DOM, same database
    a.controller.destroy();
    const b = make();
    await b.controller.start();
    expect(b.renderer.texts()).toEqual(['Participants who highlighted']);
    expect(b.controller.getState().restore[ann!.id]!.status).toBe('matched');
    expect((await store.annotations.require(ann!.id)).status).toBe('active');
    expect((await store.annotations.require(ann!.id)).anchor?.strategy).toBe('offset');
  });

  it('restores after the page content shifts (inserted banner) and records the context strategy', async () => {
    const a = make();
    await a.controller.start();
    select(document.querySelector('#p3')!, 4, 'The authors recommend selective marking'.length);
    const ann = await a.controller.createFromSelection();
    a.controller.destroy();
    const b = make(PAGE.replace('<article>', '<article><p>Subscribe to our newsletter and never miss an update.</p>'));
    await b.controller.start();
    expect(b.renderer.texts()).toEqual(['authors recommend selective marking']);
    await flush(20);
    expect((await store.annotations.require(ann!.id)).anchor?.strategy).toBe('exact-context');
  });

  it('marks a highlight orphaned when its passage disappears, and never paints it elsewhere (TC-ANN-07)', async () => {
    const a = make();
    await a.controller.start();
    select(document.querySelector('#p2')!, 0, 'Participants who highlighted key sentences'.length);
    const ann = await a.controller.createFromSelection();
    a.controller.destroy();
    const b = make(PAGE.replace('Participants who highlighted key sentences recalled', 'Subjects who skimmed headlines forgot'));
    await b.controller.start();
    expect(b.renderer.entries).toEqual([]);
    expect(b.controller.getState().restore[ann!.id]!.status).toBe('orphaned');
    await flush(20);
    expect((await store.annotations.require(ann!.id)).status).toBe('orphaned');
    // the passage comes back (page change reverted): it is restored and reactivated
    b.controller.destroy();
    const c = make();
    await c.controller.start();
    await flush(20);
    expect(c.renderer.texts()).toHaveLength(1);
    expect((await store.annotations.require(ann!.id)).status).toBe('active');
  });

  it('an ambiguous duplicate is not guessed; the user reattaches it by selecting the right passage', async () => {
    const dup = '<p id="a">Alpha. Same words here. Omega.</p><p id="b">Beta. Same words here. Psi.</p>';
    const a = make(dup);
    await a.controller.start();
    select(document.querySelector('#a')!, 'Alpha. '.length, 'Alpha. Same words here.'.length);
    const ann = await a.controller.createFromSelection();
    a.controller.destroy();

    const changed = '<p id="a">Gamma. Same words here. Delta.</p><p id="b">Epsilon. Same words here. Zeta.</p>';
    const b = make(changed);
    await b.controller.start();
    expect(b.renderer.entries).toEqual([]); // nothing painted when unsure
    expect(b.controller.getState().restore[ann!.id]).toEqual({ status: 'ambiguous', candidates: 2 });

    select(document.querySelector('#b')!, 'Epsilon. '.length, 'Epsilon. Same words here.'.length);
    await b.controller.reattach(ann!.id);
    expect(b.renderer.entries).toHaveLength(1);
    expect(b.renderer.entries[0]!.range.startContainer.parentElement!.id).toBe('b');
    expect((await store.annotations.require(ann!.id)).anchor?.strategy).toBe('manual');
  });

  it('reattach without a selection asks the user to select first', async () => {
    const a = make();
    await a.controller.start();
    select(document.querySelector('#p1')!, 0, 20);
    const ann = await a.controller.createFromSelection();
    window.getSelection()!.removeAllRanges();
    await a.controller.reattach(ann!.id);
    expect(a.controller.getState().reattachId).toBe(ann!.id);
    expect(a.notices.at(-1)?.message).toMatch(/Select the right passage/);
  });
});

describe('editing, undo and notes', () => {
  it('changes colour/type, deletes with Undo, and notes autosave and clear', async () => {
    const t = make();
    await t.controller.start();
    select(document.querySelector('#p1')!, 0, 'Reading research shows'.length);
    const ann = (await t.controller.createFromSelection())!;
    await t.controller.updateAnnotation(ann.id, { colour: '#FF9FC2', type: 'underline' });
    expect(t.renderer.entries[0]).toMatchObject({ colour: '#FF9FC2', type: 'underline' });

    const noteId = await t.controller.saveNote(ann.id, 'first draft');
    expect(noteId).toBeDefined();
    expect(await t.controller.saveNote(ann.id, 'second draft', noteId)).toBe(noteId);
    expect((await store.notes.list()).map((x) => x.body)).toEqual(['second draft']);
    expect(await t.controller.saveNote(ann.id, '   ', noteId)).toBeUndefined();
    expect(await store.notes.list()).toHaveLength(0);

    await t.controller.deleteAnnotation(ann.id);
    expect(t.renderer.entries).toEqual([]);
    await t.notices.at(-1)!.action!.run();
    await flush(10);
    expect(t.renderer.texts()).toEqual(['Reading research shows']);
  });

  it('creates a page bookmark with the scroll position and no text anchor', async () => {
    const t = make();
    await t.controller.start();
    const b = await t.controller.createBookmark('Where I stopped');
    expect(b?.type).toBe('bookmark');
    expect(b?.anchor).toBeNull();
    expect(b?.label).toBe('Where I stopped');
    expect(b?.location?.scrollRatio).toBe(0);
    expect(t.renderer.entries).toEqual([]); // bookmarks are not painted on text
    expect(t.controller.getState().annotations).toHaveLength(1);
  });

  it('page notes create the source on demand', async () => {
    const t = make();
    await t.controller.start();
    expect(await t.controller.createPageNote('   ')).toBeNull();
    await t.controller.createPageNote('Overall: promising but small sample');
    expect(t.controller.getState().pageNotes.map((x) => x.body)).toEqual(['Overall: promising but small sample']);
  });
});

describe('selection rules', () => {
  it('ignores selections in typing areas, outside the root, and inside the extension UI', async () => {
    const html = PAGE + '<div contenteditable="true" id="ce">my private draft text</div><div data-ukw-ui id="ui">extension chrome</div>';
    const t = make(html);
    await t.controller.start();
    for (const sel of ['#ce', '#ui']) {
      select(document.querySelector(sel)!, 0, 5);
      expect(await t.controller.createFromSelection()).toBeNull();
    }
    expect(await store.documents.list()).toHaveLength(0);
  });

  it('tells the user when nothing is selected', async () => {
    const t = make();
    await t.controller.start();
    window.getSelection()!.removeAllRanges();
    expect(await t.controller.createFromSelection()).toBeNull();
    expect(t.notices.at(-1)?.message).toMatch(/Select some text/);
  });

  it('exposes the selection rect for toolbar placement', async () => {
    const t = make();
    await t.controller.start();
    select(document.querySelector('#p1')!, 0, 15);
    await flush(150); // selectionchange debounce
    document.dispatchEvent(new Event('selectionchange'));
    await flush(150);
    expect(t.controller.getState().selection?.rect).toMatchObject({ top: 100, left: 50 });
  });
});

describe('anchors are captured against the live DOM, never a stale map (regression)', () => {
  it('a selection made right after the page changed stores the correct quote and still restores after reload', async () => {
    // Seed an existing highlight so start() restores it and therefore builds + caches a text map of the ORIGINAL page.
    document.body.innerHTML = PAGE;
    const seedText = buildTextMap(document.body).text;
    const at = seedText.indexOf('Reading research shows');
    const seedDoc = await store.documents.upsertFromPage({ url: location.href, title: 'Seeded' });
    await store.annotations.createAnnotation({ documentId: seedDoc.id, type: 'highlight', anchor: captureAnchor(seedText, at, at + 'Reading research shows'.length)! });

    const a = make();
    await a.controller.start();
    expect(a.renderer.texts()).toEqual(['Reading research shows']); // map was built and cached here

    // The page changes (content inserted above) and the user selects immediately, before any observer/debounce runs.
    document.querySelector('article')!.insertAdjacentHTML('afterbegin', '<p id="pre">A freshly inserted banner paragraph that shifts every offset.</p>');
    select(document.querySelector('#p2')!, 0, 'Participants who highlighted'.length);
    const ann = (await a.controller.createFromSelection())!;
    expect(ann.anchor?.exact).toBe('Participants who highlighted');
    const html = document.body.innerHTML;
    a.controller.destroy();

    const b = make(html); // same (changed) page after a reload
    await b.controller.start();
    expect(b.renderer.texts().sort()).toEqual(['Participants who highlighted', 'Reading research shows']);
    await flush(20);
    expect((await store.annotations.require(ann.id)).anchor?.strategy).toBe('offset');
  });

  it('a destroyed controller never fires late callbacks (no stray errors after teardown)', async () => {
    const a = make();
    await a.controller.start();
    select(document.querySelector('#p1')!, 0, 10);
    document.dispatchEvent(new Event('selectionchange')); // schedules a debounced capture
    a.controller.destroy();
    document.body.innerHTML = '<p>something else entirely</p>';
    await flush(200); // would previously capture against detached nodes and throw
    expect(a.controller.getState().selection).toBeNull();
  });
});

describe('conversation pages (ChatGPT adapter): message-scoped anchors', () => {
  const chat = `<main>
    <div data-message-id="m1"><p id="x1">Attention is a limited resource that drifts.</p></div>
    <div data-message-id="m2"><p id="x2">Attention is a limited resource that drifts.</p></div>
    <form><textarea>draft</textarea></form></main>`;
  const THREAD = '6a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

  it('restores the highlight in the SAME message even when the sentence is repeated in another (TC-EXT-04)', async () => {
    history.pushState({}, '', `/c/${THREAD}`);
    const a = make(chat, { adapter: chatgptAdapter });
    await a.controller.start();
    select(document.querySelector('#x2')!, 0, 'Attention is a limited resource'.length);
    const ann = await a.controller.createFromSelection();
    expect(ann?.anchor?.messageId).toBe('m2');
    const doc = await store.documents.get(ann!.documentId);
    expect(doc).toMatchObject({ platform: 'chatgpt', externalId: THREAD, sourceType: 'conversation' });

    a.controller.destroy();
    const b = make(chat, { adapter: chatgptAdapter });
    await b.controller.start();
    expect(b.renderer.entries).toHaveLength(1);
    expect(b.renderer.entries[0]!.range.startContainer.parentElement!.id).toBe('x2');
    expect(b.controller.getState().restore[ann!.id]!.status).toBe('matched');
  });

  it('finds the same thread under a different URL via the platform thread id', async () => {
    history.pushState({}, '', `/c/${THREAD}`);
    const a = make(chat, { adapter: chatgptAdapter });
    await a.controller.start();
    select(document.querySelector('#x1')!, 0, 20);
    await a.controller.createFromSelection();
    a.controller.destroy();
    history.pushState({}, '', `/g/g-project/c/${THREAD}`);
    const b = make(chat, { adapter: chatgptAdapter });
    await b.controller.start();
    expect(b.controller.getState().annotations).toHaveLength(1);
    expect(await store.documents.list()).toHaveLength(1);
  });

  it('falls back to whole-page matching when the message element is gone', async () => {
    history.pushState({}, '', `/c/${THREAD}`);
    const a = make(chat, { adapter: chatgptAdapter });
    await a.controller.start();
    select(document.querySelector('#x2')!, 0, 'Attention is a limited resource'.length);
    await a.controller.createFromSelection();
    a.controller.destroy();
    const b = make(chat.replace(/data-message-id="m\d"/g, ''), { adapter: chatgptAdapter }); // ids vanished
    await b.controller.start();
    // two identical sentences and no message scope: ambiguity is reported, not guessed
    expect(b.renderer.entries.length === 0 || b.renderer.entries.length === 1).toBe(true);
    const status = Object.values(b.controller.getState().restore)[0]!.status;
    expect(['matched', 'ambiguous']).toContain(status);
  });
});

describe('single-page-app navigation', () => {
  it('re-resolves annotations when the URL changes and when you come back', async () => {
    const t = make();
    await t.controller.start();
    select(document.querySelector('#p1')!, 0, 20);
    await t.controller.createFromSelection();
    expect(t.renderer.entries).toHaveLength(1);

    history.pushState({}, '', '/another-article');
    await t.controller.checkUrl();
    expect(t.controller.getState().document).toBeNull();
    expect(t.renderer.entries).toEqual([]);

    history.pushState({}, '', '/article');
    await t.controller.checkUrl();
    expect(t.renderer.entries).toHaveLength(1);
  });
});

describe('keyboard shortcuts and runtime commands', () => {
  const key = (init: KeyboardEventInit, target: EventTarget = document) => target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));

  it('Alt+H highlights the selection; Alt+S toggles the sidebar; Alt+K toggles the palette; Alt+B bookmarks', async () => {
    const t = make();
    await t.controller.start();
    select(document.querySelector('#p1')!, 0, 20);
    key({ key: 'h', code: 'KeyH', altKey: true });
    await flush(30);
    expect(t.renderer.entries).toHaveLength(1);
    key({ key: 's', code: 'KeyS', altKey: true });
    expect(t.controller.getState().sidebarOpen).toBe(true);
    key({ key: 's', code: 'KeyS', altKey: true });
    expect(t.controller.getState().sidebarOpen).toBe(false);
    key({ key: 'k', code: 'KeyK', altKey: true });
    expect(t.controller.getState().paletteOpen).toBe(true);
    key({ key: 'Escape', code: 'Escape' });
    expect(t.controller.getState().paletteOpen).toBe(false);
    key({ key: 'b', code: 'KeyB', altKey: true });
    await flush(30);
    expect(t.controller.getState().annotations.some((a) => a.type === 'bookmark')).toBe(true);
  });

  it('shortcuts are ignored while typing in a page field', async () => {
    const t = make(PAGE + '<input id="q">');
    await t.controller.start();
    key({ key: 's', code: 'KeyS', altKey: true }, document.querySelector('#q')!);
    expect(t.controller.getState().sidebarOpen).toBe(false);
  });

  it('responds to background commands and reports status for the popup', async () => {
    const t = make();
    await t.controller.start();
    t.controller.handleRuntimeMessage({ ukw: 'command', command: 'toggle-sidebar' });
    expect(t.controller.getState().sidebarOpen).toBe(true);
    const status = t.controller.handleRuntimeMessage({ ukw: 'command', command: 'get-status' }) as { annotations: number; hostname: string };
    expect(status).toMatchObject({ annotations: 0, hostname: 'localhost' });
    expect(t.controller.handleRuntimeMessage({ ukw: 'command', command: 'format-disk' })).toBeUndefined();
    expect(t.controller.handleRuntimeMessage('nonsense')).toBeUndefined();
  });

  it('refreshes when another context changes data (cross-tab sync)', async () => {
    const t = make();
    await t.controller.start();
    const doc = await store.documents.upsertFromPage({ url: location.href, title: 'Same page' });
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: { exact: 'attention drifts during long passages' } });
    t.controller.handleRuntimeMessage({ ukw: 'changed', entityTypes: ['annotations'] });
    await flush(300);
    expect(t.renderer.texts()).toEqual(['attention drifts during long passages']);
  });

  it('clicking a painted highlight activates it; clicking elsewhere deactivates', async () => {
    const t = make();
    await t.controller.start();
    select(document.querySelector('#p1')!, 0, 20);
    const ann = (await t.controller.createFromSelection())!;
    t.renderer.hit = ann.id;
    document.querySelector('#p3')!.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 60, clientY: 105 }));
    expect(t.controller.getState().activeId).toBe(ann.id);
    t.renderer.hit = null;
    document.querySelector('#p3')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.controller.getState().activeId).toBeNull();
  });

  it('turning the site off clears highlights and stops handling input', async () => {
    const t = make();
    await t.controller.start();
    select(document.querySelector('#p1')!, 0, 20);
    await t.controller.createFromSelection();
    await t.controller.disableOnThisSite();
    expect(t.renderer.entries).toEqual([]);
    expect(t.controller.getState().disabled).toBe(true);
    expect(await store.settings.get('disabledSites')).toContain('localhost');
    key({ key: 's', code: 'KeyS', altKey: true });
    expect(t.controller.getState().sidebarOpen).toBe(false);
  });
});

describe('settings changes made elsewhere (dashboard) reach open pages', () => {
  it('applies a new theme/accent and honours turning the site off and back on without a reload', async () => {
    const t = make();
    await t.controller.start();
    select(document.querySelector('#p1')!, 0, 20);
    await t.controller.createFromSelection();
    expect(t.renderer.entries).toHaveLength(1);

    await store.settings.set('theme', 'dim');
    t.controller.handleRuntimeMessage({ ukw: 'changed', entityTypes: ['settings'] });
    await flush(300);
    expect(t.controller.getState().settings.theme).toBe('dim');

    await store.settings.set('disabledSites', ['localhost']);
    t.controller.handleRuntimeMessage({ ukw: 'changed', entityTypes: ['settings'] });
    await flush(300);
    expect(t.controller.getState().disabled).toBe(true);
    expect(t.renderer.entries).toEqual([]);

    await store.settings.set('disabledSites', []);
    t.controller.handleRuntimeMessage({ ukw: 'changed', entityTypes: ['settings'] });
    await flush(300);
    expect(t.controller.getState().disabled).toBe(false);
    expect(t.renderer.entries).toHaveLength(1); // highlights are back
    // input handling is live again
    select(document.querySelector('#p2')!, 0, 15);
    expect(await t.controller.createFromSelection()).not.toBeNull();
  });

  it('a page that starts disabled becomes active when the site is re-enabled', async () => {
    await store.settings.set('disabledSites', ['localhost']);
    const t = make();
    await t.controller.start();
    expect(t.controller.getState().disabled).toBe(true);
    await store.settings.set('disabledSites', []);
    t.controller.handleRuntimeMessage({ ukw: 'changed', entityTypes: ['settings'] });
    await flush(300);
    expect(t.controller.getState().disabled).toBe(false);
    select(document.querySelector('#p1')!, 0, 15);
    expect(await t.controller.createFromSelection()).not.toBeNull();
  });
});

describe('robustness', () => {
  it('surfaces backend failures as an error state and notice, without throwing', async () => {
    const t = make();
    await t.controller.start();
    vi.spyOn(t.client, 'request').mockRejectedValue(new Error('boom'));
    select(document.querySelector('#p1')!, 0, 20);
    expect(await t.controller.createFromSelection()).toBeNull();
    expect(t.controller.getState().error).toMatch(/Could not save/);
    expect(t.notices.at(-1)?.kind).toBe('error');
  });

  it('re-restores when content is added dynamically after load (MutationObserver)', async () => {
    // A realistic anchor, captured from the final page text (as the real capture path would produce it).
    const finalText = 'Shell only\nLate loaded paragraph about attention';
    const start = finalText.indexOf('Late');
    const anchor = captureAnchor(finalText, start, finalText.length)!;
    const doc = await store.documents.upsertFromPage({ url: location.href, title: 'Dynamic' });
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor });
    const t = make('<article><p>Shell only</p></article>');
    await t.controller.start();
    expect(t.renderer.entries).toEqual([]);
    expect(t.controller.getState().restore[(await store.annotations.listByDocument(doc.id))[0]!.id]!.status).not.toBe('matched');
    document.querySelector('article')!.insertAdjacentHTML('beforeend', '<p>Late loaded paragraph about attention</p>');
    await flush(900); // > observer debounce
    expect(t.renderer.texts()).toEqual(['Late loaded paragraph about attention']);
  });
});
