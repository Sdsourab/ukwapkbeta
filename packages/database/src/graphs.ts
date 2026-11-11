import {
  UkwError,
  nowIso,
  type AnnotationRecord,
  type GraphEdgeRecord,
  type GraphKind,
  type GraphNodeRecord,
  type GraphNodeType,
  type GraphRecord,
  type GraphViewport,
  type NodeShape,
  type NodeSourceRef,
  SCHEMA_VERSION,
} from '@ukw/domain';
import {
  autoLayout,
  diagnoseGraph,
  nodeSize,
  parseGraphImport,
  serializeGraph,
  type GraphExport,
  type GraphIssue,
  type LayoutOptions,
} from '@ukw/graph-engine';
import type { StoreContext } from './context';
import { EntityRepo, type CreateInput, type PatchInput } from './repo';

export interface LoadedGraph {
  graph: GraphRecord;
  nodes: GraphNodeRecord[];
  /** Only edges whose endpoints exist; invalid ones are reported in `issues`. */
  edges: GraphEdgeRecord[];
  issues: GraphIssue[];
}

export interface NewNodeInput {
  type?: GraphNodeType;
  label: string;
  body?: string;
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  shape?: NodeShape;
  colour?: string;
  sourceRef?: NodeSourceRef;
  style?: Record<string, unknown>;
}

export interface NewEdgeInput {
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  relationType?: string;
  directed?: boolean;
  connector?: GraphEdgeRecord['connector'];
  colour?: string;
}

export const TEMPLATES: Record<string, { title: string; kind: GraphKind; nodes: Array<{ key: string; label: string; type: GraphNodeType; x: number; y: number; shape?: NodeShape }>; edges: Array<[string, string, string?]> }> = {
  'concept-map': {
    title: 'Concept map',
    kind: 'concept',
    nodes: [
      { key: 'c', label: 'Central concept', type: 'text', x: 0, y: 0, shape: 'pill' },
      { key: 'a', label: 'Related idea A', type: 'text', x: -260, y: 160 },
      { key: 'b', label: 'Related idea B', type: 'text', x: 260, y: 160 },
    ],
    edges: [['c', 'a', 'relates to'], ['c', 'b', 'relates to']],
  },
  'claim-evidence': {
    title: 'Claim and evidence',
    kind: 'evidence',
    nodes: [
      { key: 'claim', label: 'Claim', type: 'claim', x: 0, y: 0 },
      { key: 'e1', label: 'Supporting evidence', type: 'evidence', x: -240, y: 170 },
      { key: 'e2', label: 'Counter-evidence', type: 'evidence', x: 240, y: 170 },
      { key: 'q', label: 'Open question', type: 'question', x: 0, y: 340, shape: 'diamond' },
    ],
    edges: [['e1', 'claim', 'supports'], ['e2', 'claim', 'challenges'], ['claim', 'q', 'raises']],
  },
  flowchart: {
    title: 'Flowchart',
    kind: 'flowchart',
    nodes: [
      { key: 's', label: 'Start', type: 'text', x: 0, y: 0, shape: 'pill' },
      { key: 'd', label: 'Decision?', type: 'text', x: 0, y: 140, shape: 'diamond' },
      { key: 'y', label: 'Yes path', type: 'text', x: -200, y: 300 },
      { key: 'n', label: 'No path', type: 'text', x: 200, y: 300 },
    ],
    edges: [['s', 'd'], ['d', 'y', 'yes'], ['d', 'n', 'no']],
  },
  blank: { title: 'Untitled graph', kind: 'knowledge', nodes: [], edges: [] },
};

export class GraphRepository extends EntityRepo<GraphRecord> {
  readonly nodes: EntityRepo<GraphNodeRecord>;
  readonly edges: EntityRepo<GraphEdgeRecord>;

  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.graphs, 'graphs', 'graph');
    this.nodes = new EntityRepo<GraphNodeRecord>(ctx, ctx.db.nodes, 'nodes', 'node');
    this.edges = new EntityRepo<GraphEdgeRecord>(ctx, ctx.db.edges, 'edges', 'edge');
  }

  async createGraph(input: { title?: string; kind?: GraphKind; projectId?: string | null; template?: keyof typeof TEMPLATES | string; description?: string } = {}): Promise<GraphRecord> {
    const tpl = TEMPLATES[input.template ?? 'blank'] ?? TEMPLATES.blank!;
    return this.ctx.batch('Create graph', async () => {
      const graph = await this.create({
        title: input.title?.trim() || tpl.title,
        kind: input.kind ?? tpl.kind,
        projectId: input.projectId ?? null,
        viewport: { x: 0, y: 0, zoom: 1 },
        gridEnabled: true,
        snapEnabled: false,
        isFavorite: false,
        isArchived: false,
        description: input.description,
      });
      const ids = new Map<string, string>();
      for (const n of tpl.nodes) {
        const created = await this.addNode(graph.id, { label: n.label, type: n.type, shape: n.shape, position: { x: n.x, y: n.y } });
        ids.set(n.key, created.id);
      }
      for (const [s, t, label] of tpl.edges) await this.addEdge(graph.id, { sourceNodeId: ids.get(s)!, targetNodeId: ids.get(t)!, label });
      return graph;
    });
  }

  async load(graphId: string): Promise<LoadedGraph> {
    const graph = await this.require(graphId);
    const [nodes, allEdges] = await Promise.all([
      this.ctx.db.nodes.where('graphId').equals(graphId).filter((n) => !n.deletedAt).toArray(),
      this.ctx.db.edges.where('graphId').equals(graphId).filter((e) => !e.deletedAt).toArray(),
    ]);
    // Deterministic order (creation time, then id) so rendering z-order and exports are stable.
    const byCreation = <T extends { createdAt: string; id: string }>(a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    nodes.sort(byCreation);
    allEdges.sort(byCreation);
    const ids = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId));
    return { graph, nodes, edges, issues: diagnoseGraph(nodes, allEdges) };
  }

  async addNode(graphId: string, input: NewNodeInput): Promise<GraphNodeRecord> {
    await this.require(graphId);
    const label = input.label.slice(0, 5000);
    return this.nodes.create({
      graphId,
      type: input.type ?? 'text',
      label,
      body: input.body,
      position: input.position ?? { x: 0, y: 0 },
      dimensions: input.dimensions,
      shape: input.shape ?? 'rounded',
      colour: input.colour,
      sourceRef: input.sourceRef,
      style: input.style,
      groupId: null,
    } as CreateInput<GraphNodeRecord>);
  }

  async updateNode(id: string, patch: PatchInput<GraphNodeRecord>): Promise<GraphNodeRecord> {
    return this.nodes.update(id, patch);
  }

  /** Moving only changes positions (docs/07 §7.6). One undo step for a multi-node drag. */
  async moveNodes(moves: Array<{ id: string; position: { x: number; y: number } }>): Promise<void> {
    await this.ctx.write({ label: moves.length > 1 ? 'Move nodes' : 'Move node', tables: [this.ctx.db.nodes] }, async (w) => {
      for (const m of moves) {
        const before = await this.ctx.db.nodes.get(m.id);
        if (!before || before.deletedAt) continue;
        if (before.position.x === m.position.x && before.position.y === m.position.y) continue;
        await w.put(this.ctx.db.nodes, 'nodes', 'update', before, { ...before, position: m.position, updatedAt: nowIso(), rev: before.rev + 1 });
      }
    });
  }

  async resizeNode(id: string, dimensions: { width: number; height: number }): Promise<GraphNodeRecord> {
    return this.nodes.update(id, { dimensions: { width: Math.max(60, dimensions.width), height: Math.max(32, dimensions.height) } });
  }

  /** Deleting nodes also deletes their connected edges in the same transaction and ungroups children. */
  async removeNodes(ids: string[]): Promise<void> {
    const { db } = this.ctx;
    await this.ctx.write({ label: ids.length > 1 ? 'Delete nodes' : 'Delete node', tables: [db.nodes, db.edges] }, async (w) => {
      const now = nowIso();
      const gone = new Set<string>();
      for (const id of ids) {
        const n = await db.nodes.get(id);
        if (!n || n.deletedAt) continue;
        gone.add(id);
        await w.put(db.nodes, 'nodes', 'delete', n, { ...n, deletedAt: now, updatedAt: now, rev: n.rev + 1 });
      }
      if (gone.size === 0) return;
      const graphIds = new Set<string>();
      for (const id of gone) graphIds.add((await db.nodes.get(id))!.graphId);
      for (const graphId of graphIds) {
        for (const e of await db.edges.where('graphId').equals(graphId).toArray()) {
          if (e.deletedAt || !(gone.has(e.sourceNodeId) || gone.has(e.targetNodeId))) continue;
          await w.put(db.edges, 'edges', 'delete', e, { ...e, deletedAt: now, updatedAt: now, rev: e.rev + 1 });
        }
        for (const n of await db.nodes.where('graphId').equals(graphId).toArray()) {
          if (!n.deletedAt && n.groupId && gone.has(n.groupId)) {
            await w.put(db.nodes, 'nodes', 'update', n, { ...n, groupId: null, updatedAt: now, rev: n.rev + 1 });
          }
        }
      }
    });
  }

  /** Validates endpoints exist, are live and belong to the same graph (docs/07 §7.6). */
  async addEdge(graphId: string, input: NewEdgeInput): Promise<GraphEdgeRecord> {
    const [s, t] = await Promise.all([this.ctx.db.nodes.get(input.sourceNodeId), this.ctx.db.nodes.get(input.targetNodeId)]);
    if (!s || s.deletedAt || !t || t.deletedAt) throw new UkwError('VALIDATION_ERROR', 'Both ends of a connection must be existing nodes.');
    if (s.graphId !== graphId || t.graphId !== graphId) throw new UkwError('VALIDATION_ERROR', 'Nodes must belong to the same graph.');
    if (s.id === t.id) throw new UkwError('VALIDATION_ERROR', 'A node cannot be connected to itself.');
    const directed = input.directed ?? true;
    const siblings = await this.ctx.db.edges.where('graphId').equals(graphId).filter((e) => !e.deletedAt).toArray();
    const dup = siblings.find((e) =>
      directed
        ? e.directed && e.sourceNodeId === s.id && e.targetNodeId === t.id
        : !e.directed && ((e.sourceNodeId === s.id && e.targetNodeId === t.id) || (e.sourceNodeId === t.id && e.targetNodeId === s.id)),
    );
    if (dup) throw new UkwError('CONFLICT', 'These nodes are already connected.');
    return this.edges.create({
      graphId,
      sourceNodeId: s.id,
      targetNodeId: t.id,
      label: input.label,
      relationType: input.relationType,
      directed,
      connector: input.connector ?? 'curved',
      colour: input.colour,
    } as CreateInput<GraphEdgeRecord>);
  }

  async updateEdge(id: string, patch: PatchInput<GraphEdgeRecord>): Promise<GraphEdgeRecord> {
    const { sourceNodeId, targetNodeId, graphId, ...safe } = patch;
    if (sourceNodeId !== undefined || targetNodeId !== undefined || graphId !== undefined) {
      throw new UkwError('VALIDATION_ERROR', 'Reconnect an edge by deleting it and creating a new one.');
    }
    return this.edges.update(id, safe);
  }

  async removeEdges(ids: string[]): Promise<void> {
    await this.edges.bulkRemove(ids, ids.length > 1 ? 'Delete connections' : 'Delete connection');
  }

  /** Duplicates nodes (and edges fully inside the selection), offset so copies are visible. */
  async duplicateNodes(ids: string[], offset = { x: 40, y: 40 }): Promise<GraphNodeRecord[]> {
    const { db } = this.ctx;
    return this.ctx.batch('Duplicate nodes', async () => {
      const originals = (await db.nodes.bulkGet(ids)).filter((n): n is GraphNodeRecord => !!n && !n.deletedAt);
      if (!originals.length) return [];
      const map = new Map<string, string>();
      const copies: GraphNodeRecord[] = [];
      for (const n of originals) {
        const c = await this.addNode(n.graphId, {
          type: n.type, label: n.label, body: n.body, shape: n.shape, colour: n.colour, dimensions: n.dimensions,
          sourceRef: n.sourceRef, style: n.style, position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
        });
        map.set(n.id, c.id);
        copies.push(c);
      }
      const graphId = originals[0]!.graphId;
      for (const e of await db.edges.where('graphId').equals(graphId).filter((x) => !x.deletedAt).toArray()) {
        const s = map.get(e.sourceNodeId), t = map.get(e.targetNodeId);
        if (s && t) await this.addEdge(graphId, { sourceNodeId: s, targetNodeId: t, label: e.label, relationType: e.relationType, directed: e.directed, connector: e.connector, colour: e.colour });
      }
      return copies;
    });
  }

  /** Wraps the selected nodes in a new group node sized to their bounding box. */
  async groupNodes(ids: string[], label = 'Group'): Promise<GraphNodeRecord> {
    const { db } = this.ctx;
    return this.ctx.batch('Group nodes', async () => {
      const members = (await db.nodes.bulkGet(ids)).filter((n): n is GraphNodeRecord => !!n && !n.deletedAt && n.type !== 'group');
      if (members.length < 2) throw new UkwError('VALIDATION_ERROR', 'Select at least two nodes to group.');
      if (new Set(members.map((m) => m.graphId)).size > 1) throw new UkwError('VALIDATION_ERROR', 'Nodes must belong to the same graph.');
      const pad = 24;
      const minX = Math.min(...members.map((m) => m.position.x)) - pad;
      const minY = Math.min(...members.map((m) => m.position.y)) - pad - 20;
      const maxX = Math.max(...members.map((m) => m.position.x + nodeSize(m).width)) + pad;
      const maxY = Math.max(...members.map((m) => m.position.y + nodeSize(m).height)) + pad;
      const group = await this.addNode(members[0]!.graphId, { type: 'group', label, shape: 'rounded', position: { x: minX, y: minY }, dimensions: { width: maxX - minX, height: maxY - minY } });
      for (const m of members) await this.nodes.update(m.id, { groupId: group.id });
      return group;
    });
  }

  async ungroup(groupId: string): Promise<void> {
    const { db } = this.ctx;
    await this.ctx.batch('Ungroup', async () => {
      const members = await db.nodes.filter((n) => !n.deletedAt && n.groupId === groupId).toArray();
      for (const m of members) await this.nodes.update(m.id, { groupId: null });
      await this.nodes.remove(groupId);
    });
  }

  /** Creates a node linked to a source annotation (FR-GRAPH-003, T-026). Reuses an existing node when present. */
  async addSourceNode(graphId: string, source: { annotationId?: string; documentId?: string; noteId?: string }, position?: { x: number; y: number }): Promise<GraphNodeRecord> {
    const { db } = this.ctx;
    let label = 'Source';
    let documentId = source.documentId;
    let type: GraphNodeType = 'source';
    let colour: string | undefined;
    let body: string | undefined;
    if (source.annotationId) {
      const a = (await db.annotations.get(source.annotationId)) as AnnotationRecord | undefined;
      if (!a || a.deletedAt) throw new UkwError('NOT_FOUND', 'Annotation not found.');
      documentId = a.documentId;
      label = (a.anchor?.exact ?? a.label ?? 'Bookmark').replace(/\s+/g, ' ').slice(0, 200);
      colour = a.type === 'highlight' ? a.colour : undefined;
    } else if (source.noteId) {
      const n = await db.notes.get(source.noteId);
      if (!n || n.deletedAt) throw new UkwError('NOT_FOUND', 'Note not found.');
      documentId = n.documentId;
      label = (n.title || n.body).replace(/\s+/g, ' ').slice(0, 200);
      type = 'note';
    } else if (source.documentId) {
      const d = await db.documents.get(source.documentId);
      if (!d || d.deletedAt) throw new UkwError('NOT_FOUND', 'Document not found.');
      label = d.title || d.hostname || d.canonicalUrl;
    }
    if (documentId && source.annotationId) {
      const d = await db.documents.get(documentId);
      body = d?.title ?? d?.canonicalUrl;
    }
    const existing = await db.nodes.where('graphId').equals(graphId).filter((n) => !n.deletedAt && n.sourceRef?.annotationId === source.annotationId && n.sourceRef?.noteId === source.noteId && n.sourceRef?.documentId === documentId).first();
    if (existing) return existing;
    return this.addNode(graphId, { type, label, body, colour, position, sourceRef: { documentId, annotationId: source.annotationId, noteId: source.noteId } });
  }

  /** Re-lays out the graph. Positions only; one undo step. */
  async applyAutoLayout(graphId: string, opts?: LayoutOptions): Promise<void> {
    const { nodes, edges } = await this.load(graphId);
    const positions = autoLayout(nodes, edges, opts);
    await this.moveNodes([...positions].map(([id, position]) => ({ id, position })));
  }

  /** Viewport persistence is not undoable and is expected to be debounced by the caller. */
  async setViewport(graphId: string, viewport: GraphViewport): Promise<void> {
    const g = await this.get(graphId);
    if (!g) return;
    const v = g.viewport;
    if (Math.abs(v.x - viewport.x) < 0.5 && Math.abs(v.y - viewport.y) < 0.5 && Math.abs(v.zoom - viewport.zoom) < 0.001) return;
    await this.update(graphId, { viewport }, { history: false });
  }

  async exportGraph(graphId: string): Promise<GraphExport> {
    const { graph, nodes, edges } = await this.load(graphId);
    return serializeGraph(graph, nodes, edges);
  }

  /** Imports a graph export as a NEW graph (fresh ids). Returns warnings for anything repaired or skipped. */
  async importGraph(raw: unknown): Promise<{ graph: GraphRecord; warnings: string[] }> {
    const parsed = parseGraphImport(raw);
    if (!parsed.ok) throw new UkwError('VALIDATION_ERROR', parsed.error);
    const { graph: g, nodes, edges, warnings } = parsed.data;
    const now = nowIso();
    const record: GraphRecord = {
      id: g.id, title: g.title, kind: g.kind, viewport: g.viewport, gridEnabled: g.gridEnabled, snapEnabled: g.snapEnabled,
      description: g.description, isFavorite: false, isArchived: false, projectId: null,
      createdAt: now, updatedAt: now, schemaVersion: SCHEMA_VERSION, rev: 1,
    };
    await this.ctx.write({ label: 'Import graph', tables: [this.table, this.ctx.db.nodes, this.ctx.db.edges] }, async (w) => {
      await w.put(this.table, 'graphs', 'import', undefined, record);
      for (const n of nodes) await w.put(this.ctx.db.nodes, 'nodes', 'import', undefined, n);
      for (const e of edges) await w.put(this.ctx.db.edges, 'edges', 'import', undefined, e);
    });
    return { graph: record, warnings };
  }

  /** Tombstones the graph with its nodes and edges. */
  override async remove(id: string): Promise<void> {
    const { db } = this.ctx;
    await this.ctx.write({ label: 'Delete graph', tables: [this.table, db.nodes, db.edges] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) return;
      const now = nowIso();
      await w.put(this.table, 'graphs', 'delete', before, { ...before, deletedAt: now, updatedAt: now, rev: before.rev + 1 });
      for (const n of await db.nodes.where('graphId').equals(id).toArray()) {
        if (!n.deletedAt) await w.put(db.nodes, 'nodes', 'delete', n, { ...n, deletedAt: now, updatedAt: now, rev: n.rev + 1 });
      }
      for (const e of await db.edges.where('graphId').equals(id).toArray()) {
        if (!e.deletedAt) await w.put(db.edges, 'edges', 'delete', e, { ...e, deletedAt: now, updatedAt: now, rev: e.rev + 1 });
      }
    });
  }

  override async restore(id: string): Promise<GraphRecord> {
    const { db } = this.ctx;
    return this.ctx.write({ label: 'Restore graph', tables: [this.table, db.nodes, db.edges] }, async (w) => {
      const before = await this.table.get(id);
      if (!before) throw new UkwError('NOT_FOUND', 'Graph not found.');
      if (!before.deletedAt) return before;
      const stamp = before.deletedAt;
      const restored = await w.put(this.table, 'graphs', 'restore', before, { ...before, deletedAt: null, updatedAt: nowIso(), rev: before.rev + 1 });
      for (const n of await db.nodes.where('graphId').equals(id).toArray()) {
        if (n.deletedAt && n.deletedAt >= stamp) await w.put(db.nodes, 'nodes', 'restore', n, { ...n, deletedAt: null, updatedAt: nowIso(), rev: n.rev + 1 });
      }
      for (const e of await db.edges.where('graphId').equals(id).toArray()) {
        if (e.deletedAt && e.deletedAt >= stamp) await w.put(db.edges, 'edges', 'restore', e, { ...e, deletedAt: null, updatedAt: nowIso(), rev: e.rev + 1 });
      }
      return restored;
    });
  }
}

