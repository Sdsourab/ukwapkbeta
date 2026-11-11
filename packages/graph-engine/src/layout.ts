import type { GraphEdgeRecord, GraphNodeRecord } from '@ukw/domain';
import { connectedComponents } from './diagnostics';
import { nodeSize } from './geometry';

export type LayoutKind = 'layered-tb' | 'layered-lr' | 'radial' | 'grid';
export type Positions = Map<string, { x: number; y: number }>;

export interface LayoutOptions {
  kind?: LayoutKind;
  gapX?: number;
  gapY?: number;
  /** Root for radial layout (defaults to the highest-degree node). */
  rootId?: string;
}

/** Pure auto-layout. Returns new positions; never mutates input. Nodes with type `group` are ignored. */
export function autoLayout(allNodes: GraphNodeRecord[], edges: GraphEdgeRecord[], opts: LayoutOptions = {}): Positions {
  const kind = opts.kind ?? 'layered-tb';
  const gapX = opts.gapX ?? 60;
  const gapY = opts.gapY ?? 80;
  const nodes = allNodes.filter((n) => n.type !== 'group');
  const out: Positions = new Map();
  if (nodes.length === 0) return out;
  const ids = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId) && e.sourceNodeId !== e.targetNodeId);

  if (kind === 'grid') return gridLayout(nodes, gapX, gapY);

  const components = connectedComponents(nodes, validEdges).sort((a, b) => b.length - a.length);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cursor = 0; // advances along the cross axis for each component
  for (const comp of components) {
    const compNodes = comp.map((id) => byId.get(id)!).filter(Boolean);
    const compSet = new Set(comp);
    const compEdges = validEdges.filter((e) => compSet.has(e.sourceNodeId));
    const local = kind === 'radial' ? radial(compNodes, compEdges, gapX, gapY, opts.rootId) : layered(compNodes, compEdges, kind === 'layered-lr', gapX, gapY);
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of compNodes) {
      const p = local.get(n.id)!;
      const { width, height } = nodeSize(n);
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + width); maxY = Math.max(maxY, p.y + height);
    }
    const horizontalStack = kind !== 'layered-lr';
    for (const n of compNodes) {
      const p = local.get(n.id)!;
      out.set(n.id, horizontalStack ? { x: p.x - minX + cursor, y: p.y - minY } : { x: p.x - minX, y: p.y - minY + cursor });
    }
    cursor += (horizontalStack ? maxX - minX : maxY - minY) + (horizontalStack ? gapX : gapY) * 2;
  }
  return out;
}

function gridLayout(nodes: GraphNodeRecord[], gapX: number, gapY: number): Positions {
  const out: Positions = new Map();
  const cols = Math.max(1, Math.ceil(Math.sqrt(nodes.length)));
  const cellW = Math.max(...nodes.map((n) => nodeSize(n).width)) + gapX;
  const cellH = Math.max(...nodes.map((n) => nodeSize(n).height)) + gapY / 2;
  nodes.forEach((n, i) => out.set(n.id, { x: (i % cols) * cellW, y: Math.floor(i / cols) * cellH }));
  return out;
}

function layered(nodes: GraphNodeRecord[], edges: GraphEdgeRecord[], leftToRight: boolean, gapX: number, gapY: number): Positions {
  const ids = nodes.map((n) => n.id);
  const out: Map<string, number> = new Map(); // layer per node
  const succ = new Map<string, string[]>(ids.map((id) => [id, []]));
  const pred = new Map<string, string[]>(ids.map((id) => [id, []]));

  // Break cycles with an iterative DFS. In reverse post-order every non-back edge goes forward,
  // so edges that go backwards in that order are the cycle-closing ones and are ignored for layering.
  const state = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]));
  const rawSucc = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const e of edges) rawSucc.get(e.sourceNodeId)!.push(e.targetNodeId);
  const postOrder: string[] = [];
  for (const start of ids) {
    if (state.get(start) !== 0) continue;
    const stack: Array<{ id: string; i: number }> = [{ id: start, i: 0 }];
    state.set(start, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const nexts = rawSucc.get(top.id)!;
      if (top.i < nexts.length) {
        const nxt = nexts[top.i++]!;
        if (state.get(nxt) === 0) {
          state.set(nxt, 1);
          stack.push({ id: nxt, i: 0 });
        }
      } else {
        state.set(top.id, 2);
        postOrder.push(top.id);
        stack.pop();
      }
    }
  }
  const topo = [...postOrder].reverse();
  const topoIndex = new Map(topo.map((id, i) => [id, i]));
  for (const e of edges) {
    if (topoIndex.get(e.sourceNodeId)! < topoIndex.get(e.targetNodeId)!) {
      succ.get(e.sourceNodeId)!.push(e.targetNodeId);
      pred.get(e.targetNodeId)!.push(e.sourceNodeId);
    }
  }
  for (const id of topo) {
    const preds = pred.get(id)!;
    out.set(id, preds.length ? Math.max(...preds.map((p) => out.get(p) ?? 0)) + 1 : 0);
  }

  const layers: string[][] = [];
  for (const id of ids) {
    const l = out.get(id) ?? 0;
    (layers[l] ??= []).push(id);
  }
  for (let l = 0; l < layers.length; l++) layers[l] ??= [];

  // Crossing reduction by barycenter sweeps.
  const index = new Map<string, number>();
  const reindex = () => layers.forEach((layer) => layer.forEach((id, i) => index.set(id, i)));
  reindex();
  for (let sweep = 0; sweep < 4; sweep++) {
    const down = sweep % 2 === 0;
    const range = down ? layers.map((_, i) => i).slice(1) : layers.map((_, i) => i).slice(0, -1).reverse();
    for (const l of range) {
      const bary = new Map<string, number>();
      for (const id of layers[l]!) {
        const neigh = (down ? pred.get(id)! : succ.get(id)!).filter((n) => out.get(n) === (down ? l - 1 : l + 1));
        bary.set(id, neigh.length ? neigh.reduce((a, n) => a + (index.get(n) ?? 0), 0) / neigh.length : (index.get(id) ?? 0));
      }
      layers[l]!.sort((a, b) => bary.get(a)! - bary.get(b)! || (index.get(a) ?? 0) - (index.get(b) ?? 0));
      layers[l]!.forEach((id, i) => index.set(id, i));
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const pos: Positions = new Map();
  const maxMain = Math.max(...layers.map((layer) => layer.reduce((a, id) => a + (leftToRight ? nodeSize(byId.get(id)!).height : nodeSize(byId.get(id)!).width) + (leftToRight ? gapY / 2 : gapX), 0)));
  let mainCursor = 0;
  layers.forEach((layer) => {
    const extentCross = Math.max(0, ...layer.map((id) => (leftToRight ? nodeSize(byId.get(id)!).width : nodeSize(byId.get(id)!).height)));
    const used = layer.reduce((a, id) => a + (leftToRight ? nodeSize(byId.get(id)!).height : nodeSize(byId.get(id)!).width) + (leftToRight ? gapY / 2 : gapX), 0);
    let along = (maxMain - used) / 2;
    for (const id of layer) {
      const sz = nodeSize(byId.get(id)!);
      pos.set(id, leftToRight ? { x: mainCursor, y: along } : { x: along, y: mainCursor });
      along += (leftToRight ? sz.height : sz.width) + (leftToRight ? gapY / 2 : gapX);
    }
    mainCursor += extentCross + (leftToRight ? gapX : gapY);
  });
  return pos;
}

function radial(nodes: GraphNodeRecord[], edges: GraphEdgeRecord[], gapX: number, gapY: number, rootId?: string): Positions {
  const adj = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    adj.get(e.sourceNodeId)!.push(e.targetNodeId);
    adj.get(e.targetNodeId)!.push(e.sourceNodeId);
  }
  const root = (rootId && adj.has(rootId) ? rootId : [...adj.entries()].sort((a, b) => b[1].length - a[1].length)[0]![0])!;
  const children = new Map<string, string[]>(nodes.map((n) => [n.id, []]));
  const depth = new Map<string, number>([[root, 0]]);
  const queue = [root];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const nxt of adj.get(cur)!) {
      if (depth.has(nxt)) continue;
      depth.set(nxt, depth.get(cur)! + 1);
      children.get(cur)!.push(nxt);
      queue.push(nxt);
    }
  }
  const leaves = new Map<string, number>();
  const countLeaves = (id: string): number => {
    const c = children.get(id)!;
    const n = c.length === 0 ? 1 : c.reduce((a, k) => a + countLeaves(k), 0);
    leaves.set(id, n);
    return n;
  };
  countLeaves(root);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const ring = Math.max(...nodes.map((n) => nodeSize(n).width)) + gapX;
  const pos: Positions = new Map();
  const place = (id: string, a0: number, a1: number) => {
    const d = depth.get(id)!;
    const mid = (a0 + a1) / 2;
    const r = d * ring * 0.9 + (d > 0 ? gapY : 0);
    const sz = nodeSize(byId.get(id)!);
    pos.set(id, { x: Math.cos(mid) * r - sz.width / 2, y: Math.sin(mid) * r - sz.height / 2 });
    let a = a0;
    for (const k of children.get(id)!) {
      const span = ((a1 - a0) * leaves.get(k)!) / leaves.get(id)!;
      place(k, a, a + span);
      a += span;
    }
  };
  place(root, 0, Math.PI * 2);
  return pos;
}
