// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DataStore } from '@ukw/database';
import { buildTextMap } from '@ukw/anchor-engine';
import { handleRaw, type RouterContext } from '../../background/router';
import { adapterFor } from '../adapters';
import { createInProcessClient } from '../client';
import { PageController } from '../controller';
import type { HighlightRenderer, PaintEntry } from '../highlighter';
import { mountUi, type MountedUi } from './mount';
import { toolbarPosition } from './Toolbar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const SELF = 'abcdefghijklmnopabcdefghijklmnop';

class FakeRenderer implements HighlightRenderer {
  readonly kind = 'none' as const;
  entries: PaintEntry[] = [];
  paint(e: PaintEntry[]) { this.entries = e; }
  clear() { this.entries = []; }
  hitTest() { return null; }
  destroy() {}
}

let store: DataStore;
let controller: PageController;
let ui: MountedUi | null = null;
let renderer: FakeRenderer;
let n = 0;

const PAGE = `<article><h1>Attention</h1>
<p id="p1">Reading research shows that attention drifts during long passages of text.</p>
<p id="p2">Participants who highlighted key sentences recalled more details after one week.</p></article>`;

async function setup() {
  (Range.prototype as unknown as { getBoundingClientRect: () => unknown }).getBoundingClientRect = () => ({ top: 200, left: 100, width: 120, height: 20, bottom: 220, right: 220, x: 100, y: 200 });
  (Range.prototype as unknown as { getClientRects: () => unknown[] }).getClientRects = () => [];
  window.scrollTo = vi.fn() as never;
  history.pushState({}, '', '/ui-article');
  document.body.innerHTML = PAGE;
  store = await new DataStore({ name: `ui-${++n}-${Math.random()}`, broadcast: false }).open();
  const ctx: RouterContext = { store, selfId: SELF, actions: { openDashboard: async () => undefined } };
  renderer = new FakeRenderer();
  controller = new PageController({ doc: document, win: window, client: createInProcessClient((raw) => handleRaw(ctx, raw, { extensionId: SELF, url: location.href })), adapterFor, renderer });
  await controller.start();
  await act(async () => { ui = mountUi(controller, { mode: 'open' }); });
}

const shadow = () => ui!.shadow;
const q = <T extends Element = HTMLElement>(sel: string) => shadow().querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string) => Array.from(shadow().querySelectorAll<T>(sel));
const byText = (sel: string, t: string | RegExp) => qa(sel).find((e) => (typeof t === 'string' ? e.textContent?.trim() === t : t.test(e.textContent ?? ''))) ?? null;
const flush = async (ms = 0) => { await act(async () => { await new Promise((r) => setTimeout(r, ms)); }); };
async function click(el: Element | null) { if (!el) throw new Error('click target missing'); await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); }); await flush(30); }
async function waitFor<T>(fn: () => T, timeout = 3000): Promise<T> {
  const start = Date.now();
  for (;;) { try { return await fn(); } catch (e) { if (Date.now() - start > timeout) throw e; await flush(20); } }
}
function select(el: Element, from: number, to: number) {
  const r = document.createRange();
  r.setStart(el.firstChild!, from);
  r.setEnd(el.firstChild!, to);
  const s = window.getSelection()!;
  s.removeAllRanges();
  s.addRange(r);
}
const selectAndWait = async (el: Element, from: number, to: number) => {
  select(el, from, to);
  await act(async () => { document.dispatchEvent(new Event('selectionchange')); await new Promise((r) => setTimeout(r, 140)); });
};

beforeEach(setup);
afterEach(async () => {
  await act(async () => { ui?.unmount(); });
  ui = null;
  controller.destroy();
  store.close();
  document.body.innerHTML = '';
});

describe('isolation', () => {
  it('lives in a shadow root marked data-ukw-ui and never leaks into the page text', async () => {
    expect(ui!.host.getAttribute('data-ukw-ui')).toBe('');
    expect(ui!.host.parentElement).toBe(document.documentElement);
    expect(buildTextMap(document.body).text).not.toContain('Select');
    expect(document.body.querySelector('.ukw-root')).toBeNull(); // nothing from the UI is in the light DOM
    expect(shadow().querySelector('style, .ukw-host')).not.toBeNull();
  });
});

describe('floating toolbar (zero-friction highlight)', () => {
  it('appears for a selection and one click on a colour saves a highlight in that colour', async () => {
    await selectAndWait(document.querySelector('#p2')!, 0, 'Participants who highlighted'.length);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    expect(qa('.ukw-tb .swatch')).toHaveLength(6);
    expect(q('.ukw-tb')!.getAttribute('role')).toBe('toolbar');
    const blue = qa<HTMLButtonElement>('.ukw-tb .swatch').find((b) => b.getAttribute('aria-label') === 'Highlight: Concept')!;
    await click(blue);
    await waitFor(() => expect(renderer.entries).toHaveLength(1));
    expect(renderer.entries[0]).toMatchObject({ colour: '#8FB8FF', type: 'highlight' });
    expect(renderer.entries[0]!.range.toString()).toBe('Participants who highlighted');
    await waitFor(() => expect(q('.ukw-tb')).toBeNull()); // toolbar gone, selection cleared
    expect(await store.annotations.list()).toHaveLength(1);
    await waitFor(() => expect(byText('.ukw-toast', /Highlight saved/)).not.toBeNull());
  });

  it('underline / strikethrough buttons create those annotation types', async () => {
    await selectAndWait(document.querySelector('#p1')!, 0, 15);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    await click(q('.ukw-tb button[aria-label="Underline"]'));
    await waitFor(() => expect(renderer.entries[0]?.type).toBe('underline'));
    await selectAndWait(document.querySelector('#p2')!, 0, 12);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    await click(q('.ukw-tb button[aria-label="Strikethrough"]'));
    await waitFor(() => expect(renderer.entries.map((e) => e.type).sort()).toEqual(['strike', 'underline']));
  });

  it('keeps the selection when pressing toolbar buttons (mousedown is not allowed to steal focus)', async () => {
    await selectAndWait(document.querySelector('#p1')!, 0, 15);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    q('.ukw-tb .swatch')!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(window.getSelection()!.isCollapsed).toBe(false);
  });

  it('positions above the selection, flips below near the top, and stays within the viewport', () => {
    const above = toolbarPosition({ top: 300, left: 400, width: 100, bottom: 320 }, 1200, 800);
    expect(above.below).toBe(false);
    expect(above.top).toBeLessThan(300);
    const below = toolbarPosition({ top: 10, left: 400, width: 100, bottom: 30 }, 1200, 800);
    expect(below.below).toBe(true);
    expect(below.top).toBeGreaterThan(30);
    const edge = toolbarPosition({ top: 300, left: 5, width: 20, bottom: 320 }, 1200, 800);
    expect(edge.left).toBeGreaterThanOrEqual(8);
    const right = toolbarPosition({ top: 300, left: 1190, width: 10, bottom: 320 }, 1200, 800);
    expect(right.left + 360).toBeLessThanOrEqual(1200 - 8 + 0.0001);
  });
});

describe('annotation popover', () => {
  async function seeded() {
    await selectAndWait(document.querySelector('#p1')!, 0, 'Reading research shows'.length);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    await click(q('.ukw-tb .swatch'));
    await waitFor(() => expect(renderer.entries).toHaveLength(1));
    return controller.getState().annotations[0]!;
  }

  it('opens on activation, edits the colour, autosaves a note, and deletes with an Undo notice', async () => {
    const a = await seeded();
    await act(async () => { controller.setActive(a.id); });
    await waitFor(() => expect(q('.ukw-pop')).not.toBeNull());
    expect(q('.ukw-pop__quote')?.textContent).toBe('Reading research shows');

    await click(q('.ukw-pop [aria-label="Concept"]'));
    await waitFor(() => expect(renderer.entries[0]!.colour).toBe('#8FB8FF'));

    const ta = q<HTMLTextAreaElement>('.ukw-pop textarea')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'Check against Smith 2019');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await waitFor(async () => expect((await store.notes.list()).map((x) => x.body)).toEqual(['Check against Smith 2019']), 4000);

    await click(q('.ukw-pop [aria-label="Delete"]'));
    await waitFor(() => expect(renderer.entries).toHaveLength(0));
    await waitFor(() => expect(byText('.ukw-toast', /Annotation deleted/)).not.toBeNull());
    await click(q('.ukw-toast__action'));
    await waitFor(() => expect(renderer.entries).toHaveLength(1));
  });

  it('closes with Escape or the close button', async () => {
    const a = await seeded();
    await act(async () => { controller.setActive(a.id); });
    await waitFor(() => expect(q('.ukw-pop')).not.toBeNull());
    await click(q('.ukw-pop [aria-label="Close"]'));
    await waitFor(() => expect(q('.ukw-pop')).toBeNull());
  });

  it('"highlight and add a note" opens the popover with the note field focused', async () => {
    await selectAndWait(document.querySelector('#p2')!, 0, 20);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    await click(q('.ukw-tb button[aria-label="Highlight and add a note"]'));
    await waitFor(() => expect(q('.ukw-pop textarea')).not.toBeNull());
    expect(controller.getState().focusNote).toBe(true);
  });
});

describe('sidebar', () => {
  async function openWithOne() {
    await selectAndWait(document.querySelector('#p2')!, 0, 'Participants who highlighted'.length);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    await click(q('.ukw-tb .swatch'));
    await waitFor(() => expect(renderer.entries).toHaveLength(1));
    await act(async () => { controller.toggleSidebar(true); });
    await waitFor(() => expect(q('.ukw-side')).not.toBeNull());
  }

  it('shows a launcher with the annotation count that opens the sidebar', async () => {
    await selectAndWait(document.querySelector('#p1')!, 0, 15);
    await waitFor(() => expect(q('.ukw-tb')).not.toBeNull());
    await click(q('.ukw-tb .swatch'));
    await waitFor(() => expect(q('.ukw-launcher')).not.toBeNull());
    expect(q('.ukw-launcher')!.textContent).toBe('1');
    await click(q('.ukw-launcher'));
    await waitFor(() => expect(q('.ukw-side')).not.toBeNull());
    expect(q('.ukw-launcher')).toBeNull();
  });

  it('lists highlights with filtering, jumps to them, and removes them', async () => {
    await openWithOne();
    expect(q('.ukw-card__quote')?.textContent).toContain('Participants who highlighted');
    const filter = q<HTMLInputElement>('input[aria-label="Filter highlights"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(filter, 'zzz'); filter.dispatchEvent(new Event('input', { bubbles: true })); });
    await waitFor(() => expect(q('.ukw-card')).toBeNull());
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(filter, 'participants'); filter.dispatchEvent(new Event('input', { bubbles: true })); });
    await waitFor(() => expect(q('.ukw-card')).not.toBeNull());
    await click(q('.ukw-card__quote'));
    expect(controller.getState().activeId).not.toBeNull();
    expect(window.scrollTo).toHaveBeenCalled();
    await click(q('.ukw-card [aria-label="Delete"]'));
    await waitFor(() => expect(controller.getState().annotations).toHaveLength(0));
  });

  it('marks orphaned highlights and offers reattach', async () => {
    const doc = await store.documents.upsertFromPage({ url: location.href });
    await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: { exact: 'A sentence that is not on this page at all, anywhere', prefix: 'zz', suffix: 'yy' } });
    await controller.refresh();
    await act(async () => { controller.toggleSidebar(true); });
    await waitFor(() => expect(q('.ukw-card.is-lost')).not.toBeNull());
    expect(q('.ukw-card .badge--warn')?.textContent).toMatch(/Location lost/);
    expect(byText('.ukw-card button', 'Reattach…')).not.toBeNull();
  });

  it('empty state explains how to start; tabs switch between Highlights, Notes, Graph and Sources', async () => {
    await act(async () => { controller.toggleSidebar(true); });
    await waitFor(() => expect(q('.ukw-side')).not.toBeNull());
    expect(q('.ukw-empty h2')?.textContent).toBe('No highlights on this page');
    expect(qa('[role="tab"]').map((t) => t.textContent)).toEqual(['Highlights', 'Notes', 'Graph', 'Sources']);
    await click(byText('[role="tab"]', 'Sources'));
    expect(q('.ukw-side__body')?.textContent).toMatch(/Not saved yet/);
    expect(q('.ukw-side__body')?.textContent).toMatch(/Visiting a page records nothing/);
    expect(await store.documents.list()).toHaveLength(0);
  });

  it('creates a page note from the Notes tab (and thereby the source)', async () => {
    await act(async () => { controller.toggleSidebar(true); });
    await waitFor(() => expect(q('.ukw-side')).not.toBeNull());
    await click(byText('[role="tab"]', 'Notes'));
    const ta = q<HTMLTextAreaElement>('textarea[aria-label="New note about this page"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, 'Promising but small sample'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(byText('button', 'Save note'));
    await waitFor(() => expect(controller.getState().pageNotes).toHaveLength(1));
    expect((await store.documents.list())[0]?.canonicalUrl).toContain('/ui-article');
  });

  it('graph tab: creates a graph, adds an idea and renders a safe SVG preview', async () => {
    await act(async () => { controller.toggleSidebar(true); });
    await waitFor(() => expect(q('.ukw-side')).not.toBeNull());
    await click(byText('[role="tab"]', 'Graph'));
    await click(q('button[aria-label="New graph"]'));
    await waitFor(() => expect(q('input[aria-label="New idea"]')).not.toBeNull());
    const input = q<HTMLInputElement>('input[aria-label="New idea"]')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '<img src=x onerror=alert(1)> Working memory'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(byText('button', 'Add'));
    await waitFor(() => expect(q('.ukw-svgbox svg')).not.toBeNull());
    await waitFor(() => expect(q('.ukw-svgbox')!.textContent).toContain('Working memory'));
    const box = q('.ukw-svgbox')!;
    // The payload was rendered as inert TEXT: no element was created from it and no element carries an event handler.
    expect(box.querySelector('img, script, iframe, foreignObject')).toBeNull();
    const handlers = Array.from(box.querySelectorAll('*')).flatMap((el) => Array.from(el.attributes).filter((a) => a.name.toLowerCase().startsWith('on')));
    expect(handlers).toEqual([]);
    expect(box.innerHTML).toContain('&lt;img');
    const g = (await store.graphs.list())[0]!;
    expect((await store.graphs.load(g.id)).nodes.map((x) => x.label)).toContain('<img src=x onerror=alert(1)> Working memory');
  });

  it('"Add to graph" from a highlight creates a source-linked node', async () => {
    await openWithOne();
    const g = await store.graphs.createGraph({ title: 'Evidence' });
    await click(q('.ukw-card [aria-label="Add to graph"]'));
    await waitFor(() => expect(byText('.ukw-dialog button', 'Evidence')).not.toBeNull());
    await click(byText('.ukw-dialog button', 'Evidence'));
    await waitFor(async () => expect((await store.graphs.load(g.id)).nodes).toHaveLength(1));
    const node = (await store.graphs.load(g.id)).nodes[0]!;
    expect(node.label).toBe('Participants who highlighted');
    expect(node.sourceRef?.annotationId).toBe(controller.getState().annotations[0]!.id);
  });

  it('resizes with the keyboard, persists the width, and moves to the other side', async () => {
    await act(async () => { controller.toggleSidebar(true); });
    await waitFor(() => expect(q('.ukw-side')).not.toBeNull());
    const grip = q('.ukw-side__grip')!;
    const w0 = parseInt(q<HTMLElement>('.ukw-side')!.style.width, 10);
    await act(async () => { grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })); });
    await waitFor(() => expect(parseInt(q<HTMLElement>('.ukw-side')!.style.width, 10)).toBe(w0 + 16));
    await waitFor(async () => expect(await store.settings.get('sidebarWidth')).toBe(w0 + 16));
    for (let i = 0; i < 60; i++) await act(async () => { grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true, cancelable: true })); });
    expect(parseInt(q<HTMLElement>('.ukw-side')!.style.width, 10)).toBeLessThanOrEqual(720); // clamped
    await click(q('.ukw-side [aria-label^="Move to the left"]'));
    await waitFor(() => expect(q('.ukw-side.left')).not.toBeNull());
    expect(await store.settings.get('sidebarSide')).toBe('left');
  });

  it('Escape closes the sidebar; Close button works; undo/redo buttons act on the store', async () => {
    await openWithOne();
    await click(q('.ukw-side [aria-label="Undo"]'));
    await waitFor(() => expect(controller.getState().annotations).toHaveLength(0));
    await click(q('.ukw-side [aria-label="Redo"]'));
    await waitFor(() => expect(controller.getState().annotations).toHaveLength(1));
    await act(async () => { q('.ukw-side')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await waitFor(() => expect(q('.ukw-side')).toBeNull());
  });
});

describe('command palette (in page)', () => {
  it('opens with the extension shortcut, filters, and runs "Bookmark this spot"', async () => {
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', altKey: true, bubbles: true, cancelable: true })); });
    await waitFor(() => expect(q('.palette')).not.toBeNull());
    const input = q<HTMLInputElement>('.palette__input')!;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'bookmark'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await waitFor(() => expect(q('.palette__item')?.textContent).toMatch(/Bookmark this spot/));
    await act(async () => { q('.palette')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); });
    await waitFor(() => expect(controller.getState().annotations.some((a) => a.type === 'bookmark')).toBe(true));
    expect(q('.palette')).toBeNull();
  });

  it('typing in the palette does not trigger page shortcuts', async () => {
    await act(async () => { controller.togglePalette(true); });
    await waitFor(() => expect(q('.palette')).not.toBeNull());
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    await act(async () => { q('.palette__input')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, composed: true })); });
    document.removeEventListener('keydown', seen);
    expect(seen).not.toHaveBeenCalled();
  });
});
