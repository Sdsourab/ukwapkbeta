import type { GraphEdgeRecord, GraphNodeRecord } from '@ukw/domain';

export type GraphIssueKind = 'dangling-edge' | 'self-loop' | 'duplicate-edge' | 'disconnected-node' | 'cross-graph-edge' | 'missing-group';

export interface GraphIssue {
  kind: GraphIssueKind;
  /** Node or edge id the issue refers to. */
  id: string;
  message: string;
}

/** Orphan and disconnected-node diagnostics (docs/06 §6.4) plus integrity checks (docs/07 §7.6). */
export function diagnoseGraph(nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const touched = new Set<string>();
  const seen = new Set<string>();

  for (const e of edges) {
    const s = byId.get(e.sourceNodeId);
    const t = byId.get(e.targetNodeId);
    if (!s || !t) {
      issues.push({ kind: 'dangling-edge', id: e.id, message: 'Edge points to a node that no longer exists.' });
      continue;
    }
    if (s.graphId !== e.graphId || t.graphId !== e.graphId) {
      issues.push({ kind: 'cross-graph-edge', id: e.id, message: 'Edge connects nodes from different graphs.' });
      continue;
    }
    if (e.sourceNodeId === e.targetNodeId) issues.push({ kind: 'self-loop', id: e.id, message: 'Edge connects a node to itself.' });
    const key = e.directed ? `${e.sourceNodeId}>${e.targetNodeId}` : [e.sourceNodeId, e.targetNodeId].sort().join('~');
    if (seen.has(key)) issues.push({ kind: 'duplicate-edge', id: e.id, message: 'Duplicate edge between the same nodes.' });
    seen.add(key);
    touched.add(e.sourceNodeId);
    touched.add(e.targetNodeId);
  }

  for (const n of nodes) {
    if (n.groupId && !byId.has(n.groupId)) issues.push({ kind: 'missing-group', id: n.id, message: 'Node belongs to a group that no longer exists.' });
    if (n.type !== 'group' && nodes.length > 1 && !touched.has(n.id)) {
      issues.push({ kind: 'disconnected-node', id: n.id, message: 'Node has no connections.' });
    }
  }
  return issues;
}

/** Connected components (undirected), each a list of node ids. */
export function connectedComponents(nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.sourceNodeId) && adj.has(e.targetNodeId)) {
      adj.get(e.sourceNodeId)!.push(e.targetNodeId);
      adj.get(e.targetNodeId)!.push(e.sourceNodeId);
    }
  }
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const n of nodes) {
    if (seen.has(n.id)) continue;
    const comp: string[] = [];
    const stack = [n.id];
    seen.add(n.id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const next of adj.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
    out.push(comp);
  }
  return out;
}
