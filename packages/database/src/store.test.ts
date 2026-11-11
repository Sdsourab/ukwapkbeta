import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { captureAnchor } from '@ukw/anchor-engine';
import { UkwError } from '@ukw/domain';
import { DataStore } from './index';

let store: DataStore;
let n = 0;

beforeEach(async () => {
  store = await new DataStore({ name: `test-${++n}-${Math.random()}`, broadcast: false }).open();
});
afterEach(() => {
  store.close();
});

const TEXT = 'Reading research shows that attention drifts during long passages. Highlighting key sentences helps recall.';
const anchor = (q: string) => captureAnchor(TEXT, TEXT.indexOf(q), TEXT.indexOf(q) + q.length)!;

async function seedDoc(url = 'https://example.com/article?utm_source=x') {
  return store.documents.upsertFromPage({ url, title: 'An Article' });
}

describe('documents', () => {
  it('normalises URLs and never creates duplicates for the same page', async () => {
    const a = await seedDoc('https://Example.com/article/?utm_source=a');
    const b = await seedDoc('https://example.com/article?fbclid=zzz#frag');
    expect(b.id).toBe(a.id);
    expect(a.normalizedUrl).toBe('https://example.com/article');
    expect((await store.documents.list()).length).toBe(1);
  });
  it('rejects unsupported pages with UNSUPPORTED_PAGE', async () => {
    await expect(store.documents.upsertFromPage({ url: 'chrome://settings' })).rejects.toMatchObject({ code: 'UNSUPPORTED_PAGE' });
  });
  it('matches conversations by platform + external id even if the URL differs', async () => {
    const a = await store.documents.upsertFromPage({ url: 'https://chatgpt.com/c/abc', platform: 'chatgpt', externalId: 'abc', title: 'Chat' });
    const b = await store.documents.upsertFromPage({ url: 'https://chatgpt.com/g/xyz/c/abc', platform: 'chatgpt', externalId: 'abc' });
    expect(b.id).toBe(a.id);
    expect(a.sourceType).toBe('conversation');
  });
  it('restores a deleted document (with its annotations) when it is deleted then restored', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention drifts'), note: 'my note' });
    await store.documents.remove(doc.id);
    expect(await store.annotations.get(annotation.id)).toBeUndefined();
    expect((await store.notes.listForAnnotation(annotation.id)).length).toBe(0);
    await store.documents.restore(doc.id);
    expect(await store.annotations.get(annotation.id)).toBeDefined();
    expect((await store.notes.listForAnnotation(annotation.id)).length).toBe(1);
  });
  it('creates manual sources and rejects empty titles', async () => {
    const m = await store.documents.createManual({ title: 'My pasted text', content: 'hello' });
    expect(m.sourceType).toBe('manual');
    await expect(store.documents.createManual({ title: '  ' })).rejects.toBeInstanceOf(UkwError);
  });
});

describe('annotations', () => {
  it('creates a highlight with note atomically and persists across reopen (TC-ANN-01)', async () => {
    const doc = await seedDoc();
    const { annotation, note } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#8FB8FF', anchor: anchor('Highlighting key sentences'), note: 'Important point' });
    expect(annotation.status).toBe('active');
    expect(annotation.colour).toBe('#8FB8FF');
    expect(note?.annotationId).toBe(annotation.id);

    const name = store.db.name;
    store.close();
    store = await new DataStore({ name, broadcast: false }).open();
    const list = await store.annotations.listByDocument(doc.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.anchor?.exact).toBe('Highlighting key sentences');
    expect((await store.notes.listForAnnotation(annotation.id))[0]!.body).toBe('Important point');
  });
  it('validates input: needs text for highlights, valid colour, existing document', async () => {
    const doc = await seedDoc();
    await expect(store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: null })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: 'red', anchor: anchor('attention') })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.annotations.createAnnotation({ documentId: 'missing', type: 'bookmark', anchor: null })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    const bm = await store.annotations.createAnnotation({ documentId: doc.id, type: 'bookmark', anchor: null, label: 'Page bookmark', location: { scrollRatio: 0.4 } });
    expect(bm.annotation.anchor).toBeNull();
  });
  it('changes colour and type, rejecting bad colours', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention') });
    const updated = await store.annotations.setColour(annotation.id, '#FF9FC2');
    expect(updated.colour).toBe('#FF9FC2');
    expect(updated.rev).toBe(annotation.rev + 1);
    await expect(store.annotations.setColour(annotation.id, 'nope')).rejects.toBeInstanceOf(UkwError);
    expect((await store.annotations.update(annotation.id, { type: 'underline' })).type).toBe('underline');
  });
  it('soft delete cascades to notes and restore brings both back', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention'), note: 'n' });
    await store.annotations.remove(annotation.id);
    expect(await store.annotations.listByDocument(doc.id)).toHaveLength(0);
    expect((await store.annotations.listDeleted()).map((a) => a.id)).toContain(annotation.id);
    await store.annotations.restore(annotation.id);
    expect(await store.annotations.listByDocument(doc.id)).toHaveLength(1);
    expect(await store.notes.listForAnnotation(annotation.id)).toHaveLength(1);
  });
  it('reportRestoration marks orphaned annotations and avoids redundant writes', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention') });
    const a1 = await store.annotations.reportRestoration(annotation.id, { status: 'orphaned' });
    expect(a1?.status).toBe('orphaned');
    const a2 = await store.annotations.reportRestoration(annotation.id, { status: 'orphaned' });
    expect(a2?.rev).toBe(a1?.rev);
    const a3 = await store.annotations.reportRestoration(annotation.id, { status: 'active', confidence: 0.9, strategy: 'exact-context' });
    expect(a3?.status).toBe('active');
    expect(store.canUndo()).toBe(true); // creation is undoable, restoration reports are not
    expect(store.ctx.peekUndoLabel()).toMatch(/Create/);
  });
  it('reattach replaces the anchor and re-activates', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention') });
    await store.annotations.reportRestoration(annotation.id, { status: 'orphaned' });
    const next = await store.annotations.reattach(annotation.id, anchor('long passages'));
    expect(next.status).toBe('active');
    expect(next.anchor?.exact).toBe('long passages');
  });
  it('counts annotations per document', async () => {
    const a = await seedDoc('https://a.com/x');
    const b = await seedDoc('https://b.com/y');
    await store.annotations.createAnnotation({ documentId: a.id, type: 'highlight', anchor: anchor('attention') });
    await store.annotations.createAnnotation({ documentId: a.id, type: 'underline', anchor: anchor('recall') });
    const counts = await store.annotations.countsByDocument();
    expect(counts.get(a.id)).toBe(2);
    expect(counts.get(b.id)).toBeUndefined();
  });
});

describe('undo / redo', () => {
  it('undoes and redoes creation, edits and deletion (TC-ANN-04, TC-ANN-05)', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#F6D86B', anchor: anchor('attention'), note: 'keep' });
    await store.annotations.setColour(annotation.id, '#8FB8FF');
    await store.annotations.remove(annotation.id);
    expect(await store.annotations.get(annotation.id)).toBeUndefined();

    await store.undo(); // undo delete
    expect((await store.annotations.get(annotation.id))?.colour).toBe('#8FB8FF');
    await store.undo(); // undo colour change
    expect((await store.annotations.get(annotation.id))?.colour).toBe('#F6D86B');
    await store.undo(); // undo creation (annotation AND note in one step)
    expect(await store.annotations.get(annotation.id)).toBeUndefined();
    expect(await store.notes.listForAnnotation(annotation.id)).toHaveLength(0);

    await store.redo();
    expect(await store.annotations.get(annotation.id)).toBeDefined();
    expect(await store.notes.listForAnnotation(annotation.id)).toHaveLength(1);
    await store.redo();
    expect((await store.annotations.get(annotation.id))?.colour).toBe('#8FB8FF');
    await store.redo();
    expect(await store.annotations.get(annotation.id)).toBeUndefined();
    expect(store.canRedo()).toBe(false);
  });
  it('clears the redo stack when a new action happens', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention') });
    await store.annotations.setColour(annotation.id, '#8FB8FF');
    await store.undo();
    expect(store.canRedo()).toBe(true);
    await store.annotations.setColour(annotation.id, '#FF9FC2');
    expect(store.canRedo()).toBe(false);
  });
  it('undo never destroys data: undone creations are tombstoned and increase rev', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention') });
    await store.undo();
    const raw = await store.db.annotations.get(annotation.id);
    expect(raw?.deletedAt).toBeTruthy();
    expect(raw!.rev).toBeGreaterThan(annotation.rev);
  });
  it('returns null when there is nothing to undo', async () => {
    expect(await store.undo()).toBeNull();
    expect(await store.redo()).toBeNull();
  });
});

describe('sync outbox', () => {
  it('records one pointer per record, coalescing repeated edits', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention') });
    await store.annotations.setColour(annotation.id, '#8FB8FF');
    await store.annotations.setColour(annotation.id, '#FF9FC2');
    const q = await store.db.syncQueue.where('[entityType+recordId]').equals(['annotations', annotation.id]).toArray();
    expect(q).toHaveLength(1);
    expect(q[0]!.operation).toBe('upsert');
    expect(q[0]!.rev).toBe(3);
  });
  it('queues a delete operation for tombstones and for purges', async () => {
    const doc = await seedDoc();
    await store.documents.remove(doc.id);
    const q = await store.db.syncQueue.where('[entityType+recordId]').equals(['documents', doc.id]).toArray();
    expect(q[0]!.operation).toBe('delete');
  });
  it('writes the record and the outbox entry atomically (rollback on failure)', async () => {
    const doc = await seedDoc();
    const before = await store.pendingSyncCount();
    await expect(
      store.ctx.write({ label: 'boom', tables: [store.db.annotations] }, async (w) => {
        const rec = { id: 'x', documentId: doc.id } as never;
        await w.put(store.db.annotations, 'annotations', 'create', undefined, rec);
        throw new Error('fail mid-transaction');
      }),
    ).rejects.toThrow('fail mid-transaction');
    expect(await store.db.annotations.get('x')).toBeUndefined();
    expect(await store.pendingSyncCount()).toBe(before);
  });
});

describe('change events', () => {
  it('notifies subscribers with entity types and ids', async () => {
    const events: Array<{ types: string[]; ids: string[] }> = [];
    store.subscribe((e) => events.push({ types: e.entityTypes, ids: Object.values(e.ids).flat() as string[] }));
    const doc = await seedDoc();
    expect(events.some((e) => e.types.includes('documents') && e.ids.includes(doc.id))).toBe(true);
  });
});

describe('tags', () => {
  it('ensures case-insensitive unique tags and attaches them', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention') });
    const t1 = await store.tags.ensure('Memory');
    const t2 = await store.tags.ensure('  memory ');
    expect(t2.id).toBe(t1.id);
    await store.tags.attach(t1.id, 'annotation', annotation.id);
    await store.tags.attach(t1.id, 'annotation', annotation.id);
    expect(await store.tags.listForEntity('annotation', annotation.id)).toHaveLength(1);
    const withCounts = await store.tags.listWithCounts();
    expect(withCounts[0]).toMatchObject({ name: 'Memory', count: 1 });
  });
  it('setForEntity adds and removes tags in one undo step', async () => {
    const doc = await seedDoc();
    await store.tags.setForEntity('document', doc.id, ['alpha', 'beta']);
    expect((await store.tags.listForEntity('document', doc.id)).map((t) => t.name)).toEqual(['alpha', 'beta']);
    await store.tags.setForEntity('document', doc.id, ['beta', 'gamma']);
    expect((await store.tags.listForEntity('document', doc.id)).map((t) => t.name)).toEqual(['beta', 'gamma']);
    await store.undo();
    expect((await store.tags.listForEntity('document', doc.id)).map((t) => t.name)).toEqual(['alpha', 'beta']);
  });
  it('rejects empty/overlong names and rename clashes; deleting a tag removes its links', async () => {
    await expect(store.tags.ensure(' ')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.tags.ensure('x'.repeat(61))).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const a = await store.tags.ensure('a');
    await store.tags.ensure('b');
    await expect(store.tags.rename(a.id, 'B')).rejects.toMatchObject({ code: 'CONFLICT' });
    const doc = await seedDoc();
    await store.tags.attach(a.id, 'document', doc.id);
    await store.tags.remove(a.id);
    expect(await store.tags.listForEntity('document', doc.id)).toHaveLength(0);
    const again = await store.tags.ensure('A'); // tombstoned tag is reused, not duplicated
    expect(again.id).toBe(a.id);
  });
});

describe('collections', () => {
  it('builds a tree, counts items and prevents cycles', async () => {
    const root = await store.collections.createCollection({ name: 'Thesis', kind: 'folder' });
    const child = await store.collections.createCollection({ name: 'Chapter 1', parentId: root.id });
    const doc = await seedDoc();
    await store.collections.addItem(child.id, 'document', doc.id);
    await store.collections.addItem(child.id, 'document', doc.id); // idempotent
    const tree = await store.collections.tree();
    expect(tree[0]!.children[0]!.itemCount).toBe(1);
    await expect(store.collections.move(root.id, child.id)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.collections.move(root.id, root.id)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('re-parents children and tombstones items when a collection is deleted', async () => {
    const root = await store.collections.createCollection({ name: 'Root' });
    const mid = await store.collections.createCollection({ name: 'Mid', parentId: root.id });
    const leaf = await store.collections.createCollection({ name: 'Leaf', parentId: mid.id });
    await store.collections.remove(mid.id);
    expect((await store.collections.require(leaf.id)).parentId).toBe(root.id);
  });
});

describe('graphs', () => {
  it('creates from a template with valid structure', async () => {
    const g = await store.graphs.createGraph({ template: 'claim-evidence' });
    const loaded = await store.graphs.load(g.id);
    expect(loaded.nodes).toHaveLength(4);
    expect(loaded.edges).toHaveLength(3);
    expect(loaded.issues.filter((i) => i.kind !== 'disconnected-node')).toEqual([]);
  });
  it('deleting a node removes its edges in the same step and undo restores both (TC-GRAPH-03)', async () => {
    const g = await store.graphs.createGraph({ template: 'blank' });
    const a = await store.graphs.addNode(g.id, { label: 'A', position: { x: 0, y: 0 } });
    const b = await store.graphs.addNode(g.id, { label: 'B', position: { x: 300, y: 0 } });
    const c = await store.graphs.addNode(g.id, { label: 'C', position: { x: 600, y: 0 } });
    await store.graphs.addEdge(g.id, { sourceNodeId: a.id, targetNodeId: b.id });
    await store.graphs.addEdge(g.id, { sourceNodeId: b.id, targetNodeId: c.id });
    await store.graphs.removeNodes([b.id]);
    let loaded = await store.graphs.load(g.id);
    expect(loaded.nodes.map((n) => n.label).sort()).toEqual(['A', 'C']);
    expect(loaded.edges).toHaveLength(0);
    await store.undo();
    loaded = await store.graphs.load(g.id);
    expect(loaded.nodes).toHaveLength(3);
    expect(loaded.edges).toHaveLength(2);
  });
  it('validates edges: endpoints must exist in the same graph, no self loops, no duplicates', async () => {
    const g1 = await store.graphs.createGraph({ template: 'blank' });
    const g2 = await store.graphs.createGraph({ template: 'blank' });
    const a = await store.graphs.addNode(g1.id, { label: 'A' });
    const b = await store.graphs.addNode(g1.id, { label: 'B' });
    const other = await store.graphs.addNode(g2.id, { label: 'Other' });
    await expect(store.graphs.addEdge(g1.id, { sourceNodeId: a.id, targetNodeId: 'ghost' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.graphs.addEdge(g1.id, { sourceNodeId: a.id, targetNodeId: other.id })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.graphs.addEdge(g1.id, { sourceNodeId: a.id, targetNodeId: a.id })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await store.graphs.addEdge(g1.id, { sourceNodeId: a.id, targetNodeId: b.id });
    await expect(store.graphs.addEdge(g1.id, { sourceNodeId: a.id, targetNodeId: b.id })).rejects.toMatchObject({ code: 'CONFLICT' });
    await store.graphs.addEdge(g1.id, { sourceNodeId: b.id, targetNodeId: a.id }); // opposite direction is allowed
  });
  it('moves multiple nodes in one undoable step and persists positions', async () => {
    const g = await store.graphs.createGraph({ template: 'blank' });
    const a = await store.graphs.addNode(g.id, { label: 'A', position: { x: 0, y: 0 } });
    const b = await store.graphs.addNode(g.id, { label: 'B', position: { x: 10, y: 10 } });
    await store.graphs.moveNodes([{ id: a.id, position: { x: 100, y: 100 } }, { id: b.id, position: { x: 200, y: 200 } }]);
    let l = await store.graphs.load(g.id);
    expect(l.nodes.find((n) => n.id === a.id)!.position).toEqual({ x: 100, y: 100 });
    await store.undo();
    l = await store.graphs.load(g.id);
    expect(l.nodes.find((n) => n.id === a.id)!.position).toEqual({ x: 0, y: 0 });
    expect(l.nodes.find((n) => n.id === b.id)!.position).toEqual({ x: 10, y: 10 });
  });
  it('groups, ungroups and duplicates nodes', async () => {
    const g = await store.graphs.createGraph({ template: 'blank' });
    const a = await store.graphs.addNode(g.id, { label: 'A', position: { x: 0, y: 0 } });
    const b = await store.graphs.addNode(g.id, { label: 'B', position: { x: 300, y: 0 } });
    await store.graphs.addEdge(g.id, { sourceNodeId: a.id, targetNodeId: b.id });
    await expect(store.graphs.groupNodes([a.id])).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const group = await store.graphs.groupNodes([a.id, b.id], 'Pair');
    expect(group.type).toBe('group');
    expect(group.dimensions!.width).toBeGreaterThan(480);
    let l = await store.graphs.load(g.id);
    expect(l.nodes.filter((n) => n.groupId === group.id)).toHaveLength(2);
    const copies = await store.graphs.duplicateNodes([a.id, b.id]);
    expect(copies).toHaveLength(2);
    l = await store.graphs.load(g.id);
    expect(l.edges).toHaveLength(2); // the internal edge was duplicated too
    await store.graphs.ungroup(group.id);
    l = await store.graphs.load(g.id);
    expect(l.nodes.some((n) => n.groupId)).toBe(false);
    expect(l.nodes.some((n) => n.id === group.id)).toBe(false);
  });
  it('creates source-linked nodes from annotations and does not duplicate them (FR-GRAPH-003)', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#8FB8FF', anchor: anchor('attention drifts during long passages') });
    const g = await store.graphs.createGraph({ template: 'blank' });
    const node = await store.graphs.addSourceNode(g.id, { annotationId: annotation.id });
    expect(node.label).toBe('attention drifts during long passages');
    expect(node.sourceRef).toMatchObject({ annotationId: annotation.id, documentId: doc.id });
    const again = await store.graphs.addSourceNode(g.id, { annotationId: annotation.id });
    expect(again.id).toBe(node.id);
    await expect(store.graphs.addSourceNode(g.id, { annotationId: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('auto-layout persists new positions', async () => {
    const g = await store.graphs.createGraph({ template: 'flowchart' });
    await store.graphs.applyAutoLayout(g.id, { kind: 'layered-tb' });
    const l = await store.graphs.load(g.id);
    const start = l.nodes.find((n) => n.label === 'Start')!;
    const yes = l.nodes.find((n) => n.label === 'Yes path')!;
    expect(start.position.y).toBeLessThan(yes.position.y);
  });
  it('exports and re-imports a graph as a new graph with warnings for repaired data', async () => {
    const g = await store.graphs.createGraph({ template: 'claim-evidence', title: 'Evidence' });
    const json = JSON.parse(JSON.stringify(await store.graphs.exportGraph(g.id)));
    json.edges.push({ id: 'bad', sourceNodeId: 'nope', targetNodeId: 'nada', directed: true });
    const imported = await store.graphs.importGraph(json);
    expect(imported.graph.id).not.toBe(g.id);
    expect(imported.warnings).toHaveLength(1);
    const l = await store.graphs.load(imported.graph.id);
    expect(l.nodes).toHaveLength(4);
    expect(l.edges).toHaveLength(3);
    await expect(store.graphs.importGraph({ nope: true })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
  it('deleting a graph tombstones nodes and edges and restore brings them back', async () => {
    const g = await store.graphs.createGraph({ template: 'claim-evidence' });
    await store.graphs.remove(g.id);
    expect(await store.graphs.get(g.id)).toBeUndefined();
    await store.graphs.restore(g.id);
    const l = await store.graphs.load(g.id);
    expect(l.nodes).toHaveLength(4);
    expect(l.edges).toHaveLength(3);
  });
  it('skips no-op viewport writes', async () => {
    const g = await store.graphs.createGraph({ template: 'blank' });
    const r1 = (await store.graphs.require(g.id)).rev;
    await store.graphs.setViewport(g.id, { x: 0, y: 0, zoom: 1 });
    expect((await store.graphs.require(g.id)).rev).toBe(r1);
    await store.graphs.setViewport(g.id, { x: 50, y: 20, zoom: 1.2 });
    expect((await store.graphs.require(g.id)).viewport).toEqual({ x: 50, y: 20, zoom: 1.2 });
  });
});

describe('search', () => {
  it('finds annotations, notes, documents and nodes; supports phrases, filters and tags (TC-SEARCH-01)', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', colour: '#8FB8FF', anchor: anchor('attention drifts'), note: 'Compare with the Smith 2019 study' });
    const tag = await store.tags.ensure('memory');
    await store.tags.attach(tag.id, 'annotation', annotation.id);
    const g = await store.graphs.createGraph({ template: 'blank', title: 'Memory model' });
    await store.graphs.addNode(g.id, { label: 'Working memory limits' });

    const byWord = await store.search.search({ query: 'attention' });
    expect(byWord.map((r) => r.entityType)).toContain('annotation');
    const byNote = await store.search.search({ query: 'smith 2019' });
    expect(byNote.some((r) => r.entityType === 'annotation' && r.entityId === annotation.id)).toBe(true);
    expect(byNote.some((r) => r.entityType === 'note')).toBe(true);
    expect((await store.search.search({ query: '"smith 2020"' })).length).toBe(0);
    expect((await store.search.search({ query: 'memory' })).map((r) => r.entityType).sort()).toEqual(expect.arrayContaining(['annotation', 'graph', 'node']));
    expect((await store.search.search({ query: 'attention', colour: '#8fb8ff' })).length).toBe(1);
    expect((await store.search.search({ query: 'attention', colour: '#000000' })).length).toBe(0);
    expect((await store.search.search({ query: '', tagIds: [tag.id], types: ['annotation'] })).length).toBe(1);
    expect((await store.search.search({ query: 'attention', documentId: 'other' })).length).toBe(0);
  });
  it('excludes deleted items, reflects edits immediately, and never returns stale index data', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention drifts') });
    expect((await store.search.search({ query: 'drifts' })).length).toBe(1);
    await store.annotations.remove(annotation.id);
    expect((await store.search.search({ query: 'drifts' })).length).toBe(0);
    await store.annotations.restore(annotation.id);
    expect((await store.search.search({ query: 'drifts' })).length).toBe(1);
    await store.notes.save({ documentId: doc.id, annotationId: annotation.id, body: 'zebra' });
    expect((await store.search.search({ query: 'zebra' })).length).toBeGreaterThan(0);
  });
  it('ranks title matches above body matches and returns snippets', async () => {
    await store.notes.save({ title: 'Quokka', body: 'unrelated' });
    await store.notes.save({ body: 'a long body that mentions a quokka somewhere deep inside the text' });
    const r = await store.search.search({ query: 'quokka' });
    expect(r[0]!.title).toBe('Quokka');
    expect(r[1]!.snippet.toLowerCase()).toContain('quokka');
  });
  it('searches 5,000 annotations fast (NFR-PERF)', async () => {
    const doc = await seedDoc();
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      id: `a${i}`, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', schemaVersion: 1, rev: 1,
      documentId: doc.id, type: 'highlight' as const, colour: '#F6D86B', status: 'active' as const, isFavorite: false,
      anchor: { exact: `Sentence number ${i} about topic ${i % 50} and findings` },
    }));
    await store.db.annotations.bulkAdd(rows);
    store.search.invalidate();
    await store.search.search({ query: 'warmup' }); // build index
    const t0 = performance.now();
    const r = await store.search.search({ query: 'topic 7 findings' });
    expect(performance.now() - t0).toBeLessThan(300);
    expect(r.length).toBeGreaterThan(0);
  });
});

describe('settings', () => {
  it('returns defaults, persists valid values and rejects invalid ones', async () => {
    expect((await store.settings.getAll()).theme).toBe('system');
    await store.settings.set('theme', 'dim');
    expect(await store.settings.get('theme')).toBe('dim');
    await expect(store.settings.set('theme', 'neon' as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.settings.set('sidebarWidth', 5 as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(store.settings.set('accent', 'red' as never)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await store.settings.set('sidebarWidth', 420);
    expect((await store.settings.getAll()).sidebarWidth).toBe(420);
  });
});

describe('reading progress', () => {
  it('upserts a single record per document and clamps the ratio', async () => {
    const doc = await seedDoc();
    await store.progress.save(doc.id, { scrollRatio: 0.3, addSeconds: 10 });
    const p = await store.progress.save(doc.id, { scrollRatio: 7, headingId: 'intro', addSeconds: 5 });
    expect(p.scrollRatio).toBe(1);
    expect(p.secondsRead).toBe(15);
    expect(await store.db.readingProgress.count()).toBe(1);
    await expect(store.progress.save(doc.id, { scrollRatio: NaN })).rejects.toBeInstanceOf(UkwError);
  });
});

describe('research', () => {
  it('manages tracker items, references (with DOI dedupe) and matrices', async () => {
    const p = await store.projects.createProject({ title: 'Attention study' });
    let proj = await store.projects.addItem(p.id, 'questions', 'Does highlighting help?');
    proj = await store.projects.updateItem(p.id, 'questions', proj.questions[0]!.id, { status: 'resolved' });
    expect(proj.questions[0]!.status).toBe('resolved');
    await expect(store.projects.addItem(p.id, 'gaps', '  ')).rejects.toBeInstanceOf(UkwError);

    const ref = await store.references.createReference({ title: 'Highlighting and recall', projectId: p.id, doi: '10.1/ABC', authors: [{ family: 'Rahman', given: 'S' }], year: 2020 });
    expect((await store.references.findByDoi('https://doi.org/10.1/abc'))?.id).toBe(ref.id);
    await expect(store.references.createReference({ title: 'Bad year', year: 12 })).rejects.toBeInstanceOf(UkwError);

    const m = await store.matrices.createMatrix({ title: 'Literature', kind: 'literature', projectId: p.id });
    expect(m.columns).toHaveLength(3);
    let mat = await store.matrices.addRow(m.id, { referenceId: ref.id });
    mat = await store.matrices.setCell(m.id, mat.rows[0]!.id, m.columns[1]!.id, 'Recall improved');
    expect(mat.rows[0]!.cells[m.columns[1]!.id]).toBe('Recall improved');
    await expect(store.matrices.setCell(m.id, mat.rows[0]!.id, 'nope', 'x')).rejects.toBeInstanceOf(UkwError);
    mat = await store.matrices.removeColumn(m.id, m.columns[1]!.id);
    expect(mat.rows[0]!.cells[m.columns[1]!.id]).toBeUndefined();

    const summary = await store.projects.summary(p.id);
    expect(summary).toMatchObject({ references: 1, matrices: 1 });
  });
  it('orders open tasks by due date and priority', async () => {
    await store.tasks.createTask({ title: 'later', dueAt: '2027-01-01' });
    await store.tasks.createTask({ title: 'soon', dueAt: '2026-12-01' });
    const done = await store.tasks.createTask({ title: 'done' });
    await store.tasks.setStatus(done.id, 'done');
    expect((await store.tasks.listOpen()).map((t) => t.title)).toEqual(['soon', 'later']);
  });
});

describe('trash', () => {
  it('lists deleted items once (children with their parent), restores and purges permanently', async () => {
    const doc = await seedDoc();
    const { annotation } = await store.annotations.createAnnotation({ documentId: doc.id, type: 'highlight', anchor: anchor('attention'), note: 'n' });
    await store.documents.remove(doc.id);
    let trash = await store.listTrash();
    expect(trash.map((t) => t.entityType)).toEqual(['documents']);
    await store.restoreFromTrash('documents', doc.id);
    expect(await store.annotations.get(annotation.id)).toBeDefined();

    await store.documents.remove(doc.id);
    await store.purgeFromTrash('documents', doc.id);
    expect(await store.db.documents.get(doc.id)).toBeUndefined();
    expect(await store.db.annotations.get(annotation.id)).toBeUndefined();
    expect(await store.db.notes.count()).toBe(0);
    trash = await store.listTrash();
    expect(trash).toHaveLength(0);
  });
  it('refuses to purge items that are not in Trash', async () => {
    const doc = await seedDoc();
    await expect(store.purgeFromTrash('documents', doc.id)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await store.documents.get(doc.id)).toBeDefined();
  });
});
