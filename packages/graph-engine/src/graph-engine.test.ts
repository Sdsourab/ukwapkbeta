import { describe, expect, it } from 'vitest';
import type { GraphEdgeRecord, GraphNodeRecord, GraphRecord } from '@ukw/domain';
import { autoLayout, boundingBox, boundaryPoint, connectedComponents, diagnoseGraph, graphToSvg, nodeSize, parseGraphImport, serializeGraph, snap } from './index';

const T = '2026-01-01T00:00:00.000Z';
const base = { createdAt: T, updatedAt: T, schemaVersion: 1, rev: 1 };
const node = (id: string, x = 0, y = 0, extra: Partial<GraphNodeRecord> = {}): GraphNodeRecord => ({
  ...base, id, graphId: 'g', type: 'text', label: id, position: { x, y }, shape: 'rounded', ...extra,
});
const edge = (id: string, s: string, t: string, extra: Partial<GraphEdgeRecord> = {}): GraphEdgeRecord => ({
  ...base, id, graphId: 'g', sourceNodeId: s, targetNodeId: t, directed: true, connector: 'curved', ...extra,
});
const graph: GraphRecord = { ...base, id: 'g', title: 'Test graph', kind: 'knowledge', viewport: { x: 5, y: 6, zoom: 1.5 }, gridEnabled: true, snapEnabled: false, isFavorite: false, isArchived: false };

function overlaps(a: GraphNodeRecord, b: GraphNodeRecord, pos: Map<string, { x: number; y: number }>) {
  const pa = pos.get(a.id)!, pb = pos.get(b.id)!;
  const sa = nodeSize(a), sb = nodeSize(b);
  return pa.x < pb.x + sb.width && pb.x < pa.x + sa.width && pa.y < pb.y + sb.height && pb.y < pa.y + sa.height;
}

describe('geometry', () => {
  it('computes bounding box, snapping and boundary points', () => {
    expect(boundingBox([node('a', 0, 0), node('b', 300, 100)])).toEqual({ x: 0, y: 0, width: 480, height: 164 });
    expect(snap(33)).toBe(40);
    const p = boundaryPoint(node('a', 0, 0), { x: 1000, y: 32 });
    expect(p.x).toBeCloseTo(180);
  });
});

describe('diagnoseGraph', () => {
  it('reports dangling, duplicate, self-loop and disconnected items', () => {
    const nodes = [node('a'), node('b'), node('c'), node('lonely')];
    const edges = [edge('e1', 'a', 'b'), edge('e2', 'a', 'b'), edge('e3', 'b', 'missing'), edge('e4', 'c', 'c')];
    const kinds = diagnoseGraph(nodes, edges).map((i) => `${i.kind}:${i.id}`);
    expect(kinds).toContain('duplicate-edge:e2');
    expect(kinds).toContain('dangling-edge:e3');
    expect(kinds).toContain('self-loop:e4');
    expect(kinds).toContain('disconnected-node:lonely');
    expect(kinds).not.toContain('disconnected-node:a');
  });
  it('treats opposite undirected edges as duplicates but directed ones as distinct', () => {
    const nodes = [node('a'), node('b')];
    expect(diagnoseGraph(nodes, [edge('1', 'a', 'b'), edge('2', 'b', 'a')]).some((i) => i.kind === 'duplicate-edge')).toBe(false);
    expect(diagnoseGraph(nodes, [edge('1', 'a', 'b', { directed: false }), edge('2', 'b', 'a', { directed: false })]).some((i) => i.kind === 'duplicate-edge')).toBe(true);
  });
  it('finds connected components', () => {
    const comps = connectedComponents([node('a'), node('b'), node('c'), node('d')], [edge('1', 'a', 'b'), edge('2', 'c', 'd')]);
    expect(comps).toHaveLength(2);
  });
});

describe('autoLayout', () => {
  const nodes = ['root', 'a', 'b', 'c', 'd', 'e'].map((id) => node(id));
  const edges = [edge('1', 'root', 'a'), edge('2', 'root', 'b'), edge('3', 'a', 'c'), edge('4', 'b', 'd'), edge('5', 'a', 'e'), edge('6', 'c', 'root') /* cycle */];

  it('layers a tree top-to-bottom without overlaps and tolerates cycles', () => {
    const pos = autoLayout(nodes, edges, { kind: 'layered-tb' });
    expect(pos.size).toBe(nodes.length);
    expect(pos.get('root')!.y).toBeLessThan(pos.get('a')!.y);
    expect(pos.get('a')!.y).toBeLessThan(pos.get('c')!.y);
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlaps(nodes[i]!, nodes[j]!, pos)).toBe(false);
  });
  it('layers left-to-right', () => {
    const pos = autoLayout(nodes, edges, { kind: 'layered-lr' });
    expect(pos.get('root')!.x).toBeLessThan(pos.get('a')!.x);
  });
  it('radial and grid layouts place every node without overlap', () => {
    for (const kind of ['radial', 'grid'] as const) {
      const pos = autoLayout(nodes, edges, { kind });
      expect(pos.size).toBe(nodes.length);
      for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(overlaps(nodes[i]!, nodes[j]!, pos)).toBe(false);
    }
  });
  it('keeps disconnected components apart and ignores group nodes', () => {
    const more = [...nodes, node('x'), node('y'), node('grp', 0, 0, { type: 'group' })];
    const pos = autoLayout(more, [...edges, edge('7', 'x', 'y')], { kind: 'layered-tb' });
    expect(pos.has('grp')).toBe(false);
    for (let i = 0; i < more.length - 1; i++) for (let j = i + 1; j < more.length - 1; j++) expect(overlaps(more[i]!, more[j]!, pos)).toBe(false);
  });
  it('handles empty input and self-loops', () => {
    expect(autoLayout([], []).size).toBe(0);
    expect(autoLayout([node('a')], [edge('s', 'a', 'a')]).size).toBe(1);
  });
  it('lays out 500 nodes quickly', () => {
    const big = Array.from({ length: 500 }, (_, i) => node(`n${i}`));
    const bigEdges = big.slice(1).map((n, i) => edge(`e${i}`, `n${Math.floor(i / 3)}`, n.id));
    const t0 = performance.now();
    const pos = autoLayout(big, bigEdges);
    expect(pos.size).toBe(500);
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe('export / import', () => {
  const nodes = [node('a', 0, 0), node('b', 300, 0, { groupId: 'a', sourceRef: { documentId: 'doc-1', annotationId: 'ann-1' } })];
  const edges = [edge('e', 'a', 'b', { label: 'supports' })];

  it('round-trips structure, labels and source references with fresh ids', () => {
    const json = JSON.parse(JSON.stringify(serializeGraph(graph, nodes, edges)));
    const r = parseGraphImport(json);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.graph.title).toBe('Test graph');
    expect(r.data.graph.viewport).toEqual({ x: 5, y: 6, zoom: 1.5 });
    expect(r.data.nodes).toHaveLength(2);
    expect(r.data.nodes.map((n) => n.id)).not.toContain('a');
    const b = r.data.nodes.find((n) => n.label === 'b')!;
    expect(b.sourceRef).toEqual({ documentId: 'doc-1', annotationId: 'ann-1' });
    expect(b.groupId).toBe(r.data.nodes.find((n) => n.label === 'a')!.id);
    expect(r.data.edges[0]!.sourceNodeId).toBe(r.data.nodes.find((n) => n.label === 'a')!.id);
    expect(r.data.edges[0]!.label).toBe('supports');
    expect(r.data.warnings).toEqual([]);
  });
  it('reports and skips edges with missing endpoints instead of silently dropping them', () => {
    const json = JSON.parse(JSON.stringify(serializeGraph(graph, nodes, [...edges, edge('bad', 'a', 'ghost')])));
    const r = parseGraphImport(json);
    expect(r.ok && r.data.edges).toHaveLength(1);
    expect(r.ok && r.data.warnings.join(' ')).toMatch(/not in the file/);
  });
  it('rejects wrong format and newer schema; repairs unknown enum values', () => {
    expect(parseGraphImport({ format: 'nope' }).ok).toBe(false);
    expect(parseGraphImport({ format: 'ukw-graph', schemaVersion: 99, graph: { title: 't' }, nodes: [], edges: [] }).ok).toBe(false);
    const r = parseGraphImport({ format: 'ukw-graph', schemaVersion: 1, graph: { title: 't', kind: 'weird' }, nodes: [{ id: 'n', type: 'alien', label: 'x', position: { x: 1, y: 2 }, shape: 'blob' }], edges: [] });
    expect(r.ok && r.data.nodes[0]!.type).toBe('text');
    expect(r.ok && r.data.nodes[0]!.shape).toBe('rounded');
    expect(r.ok && r.data.graph.kind).toBe('knowledge');
  });
  it('skips malformed nodes with a warning', () => {
    const r = parseGraphImport({ format: 'ukw-graph', schemaVersion: 1, graph: { title: 't' }, nodes: [{ id: 'n' }, { id: 'ok', type: 'text', label: 'ok', position: { x: 0, y: 0 } }], edges: [] });
    expect(r.ok && r.data.nodes).toHaveLength(1);
    expect(r.ok && r.data.warnings).toHaveLength(1);
  });
});

describe('graphToSvg', () => {
  it('produces escaped, script-free SVG with arrows and labels', () => {
    const evil = node('x', 0, 0, { label: '<script>alert(1)</script> & "quotes"', colour: 'red;" onload="alert(1)' });
    const svg = graphToSvg('A <b>title</b>', [evil, node('y', 300, 0)], [edge('e', 'x', 'y', { label: 'a<b' })]);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('onload');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('marker-end="url(#arrow)"');
    expect(svg).toContain('a&lt;b');
  });
  it('omits deleted nodes and edges', () => {
    const svg = graphToSvg('t', [node('a'), node('b', 300, 0, { deletedAt: T })], [edge('e', 'a', 'b')]);
    // The only <path> left is the arrowhead marker definition; no edge path is drawn.
    expect(svg).not.toMatch(/<path d="M[^"]*" fill="none"/);
    expect(svg).not.toContain('marker-end');
  });
});
