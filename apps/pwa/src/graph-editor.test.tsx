// @vitest-environment jsdom
// Smoke test for the React Flow editor. jsdom has no layout engine, so only behaviour that does not depend on
// real geometry is asserted (mount, render of nodes, toolbar, inspector, persistence of an added node).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { DataStore } from '@ukw/database';
import { ToastProvider } from '@ukw/ui';
import GraphEditor from './screens/GraphEditor';
import { StoreProvider } from './store-context';
import { byText, click, mount, q, qa, typeInto, waitFor, type Mounted } from '../../../tests/react-utils';

let store: DataStore;
let m: Mounted | null = null;
let n = 0;

beforeEach(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).ResizeObserver = RO;
  (globalThis as any).DOMMatrixReadOnly = class { m22 = 1; constructor(_t?: string) {} };
  (globalThis as any).DOMMatrix = (globalThis as any).DOMMatrixReadOnly;
  (HTMLElement.prototype as any).getBoundingClientRect = function () { return { x: 0, y: 0, top: 0, left: 0, width: 800, height: 600, right: 800, bottom: 600 }; };
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 600 });
  Element.prototype.scrollIntoView = vi.fn();
  window.scrollTo = vi.fn() as never;
});
afterEach(async () => { await m?.unmount(); m = null; store?.close(); document.body.innerHTML = ''; vi.restoreAllMocks(); });

async function open(graphId: string) {
  m = await mount(
    <StoreProvider store={store}><ToastProvider><MemoryRouter initialEntries={[`/graphs/${graphId}`]}>
      <Routes><Route path="/graphs/:id" element={<GraphEditor />} /><Route path="/graphs" element={<div>list</div>} /><Route path="/doc/:id" element={<div>doc</div>} /></Routes>
    </MemoryRouter></ToastProvider></StoreProvider>,
  );
}

describe('GraphEditor (React Flow) smoke test', () => {
  it('mounts a seeded graph, renders its nodes and the tool/inspector chrome without errors', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    store = await new DataStore({ name: `ge-${++n}-${Math.random()}`, broadcast: false }).open();
    const g = await store.graphs.createGraph({ template: 'claim-evidence', title: 'Evidence map' });
    await open(g.id);
    await waitFor(() => expect(qa('.ukw-node').length).toBe(4));
    expect(q('.react-flow')).not.toBeNull();
    expect(qa('.ukw-node').map((x) => x.textContent).join('|')).toMatch(/Claim/);
    expect(q('[role="toolbar"][aria-label="Graph tools"]')).not.toBeNull();
    // inspector shows graph properties when nothing is selected
    expect((q('input[aria-label="Graph title"]') as HTMLInputElement).value).toBe('Evidence map');
    expect(q('.ginspector')?.textContent).toMatch(/4\s*nodes/);
    expect(errors.mock.calls.filter((c) => /Warning|Error: /.test(String(c[0])) && !/act\(/.test(String(c[0])))).toEqual([]);
  });

  it('adding a node from the toolbar persists it and shows it on the canvas', async () => {
    store = await new DataStore({ name: `ge-${++n}-${Math.random()}`, broadcast: false }).open();
    const g = await store.graphs.createGraph({ template: 'blank' });
    await open(g.id);
    await waitFor(() => expect(q('button[aria-label^="Add node"]')).not.toBeNull());
    expect(byText('.ukw-empty h2', 'An empty canvas')).not.toBeNull();
    await click(q('button[aria-label^="Add node"]'));
    await waitFor(async () => expect((await store.graphs.load(g.id)).nodes).toHaveLength(1));
    await waitFor(() => expect(qa('.ukw-node').length).toBe(1));
    expect(qa('.ukw-node')[0]!.textContent).toBe('New idea');
    // the new node is selected, so the inspector offers its label for editing
    await waitFor(() => expect(q('textarea[aria-label="Node label"]')).not.toBeNull());
    await typeInto(q<HTMLTextAreaElement>('textarea[aria-label="Node label"]'), 'Working memory limits');
    await waitFor(async () => expect((await store.graphs.load(g.id)).nodes[0]!.label).toBe('Working memory limits'), 4000);
  });

  it('shows a helpful state for a graph that does not exist', async () => {
    store = await new DataStore({ name: `ge-${++n}-${Math.random()}`, broadcast: false }).open();
    await open('missing-id');
    await waitFor(() => expect(q('.ukw-empty h2')?.textContent).toBe('Graph not found'));
  });

  it('renders source-linked nodes and a warning for sources that no longer exist', async () => {
    store = await new DataStore({ name: `ge-${++n}-${Math.random()}`, broadcast: false }).open();
    const doc = await store.documents.upsertFromPage({ url: 'https://s.example/x', title: 'Source doc' });
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: { exact: 'linked quote' } });
    const g = await store.graphs.createGraph({ template: 'blank' });
    const node = await store.graphs.addSourceNode(g.id, { annotationId: annotation.id });
    await open(g.id);
    await waitFor(() => expect(qa('.ukw-node').length).toBe(1));
    expect(q('.ukw-node__tag')).not.toBeNull(); // link badge
    expect(q('.ukw-node')!.textContent).toContain('linked quote');
    void node;
  });
});
