import type { GraphNodeRecord } from '@ukw/domain';

export const DEFAULT_NODE_SIZE = { width: 180, height: 64 } as const;
export const GRID_SIZE = 20;

export function nodeSize(n: Pick<GraphNodeRecord, 'dimensions'>): { width: number; height: number } {
  return { width: n.dimensions?.width ?? DEFAULT_NODE_SIZE.width, height: n.dimensions?.height ?? DEFAULT_NODE_SIZE.height };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function boundingBox(nodes: Array<Pick<GraphNodeRecord, 'position' | 'dimensions'>>): Box {
  if (nodes.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of nodes) {
    const { width, height } = nodeSize(n);
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + width);
    maxY = Math.max(maxY, n.position.y + height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function snap(value: number, grid = GRID_SIZE): number {
  return Math.round(value / grid) * grid;
}

export function center(n: Pick<GraphNodeRecord, 'position' | 'dimensions'>): { x: number; y: number } {
  const { width, height } = nodeSize(n);
  return { x: n.position.x + width / 2, y: n.position.y + height / 2 };
}

/** Where the segment from the node's centre toward `target` leaves the node's rectangular bounds. */
export function boundaryPoint(n: Pick<GraphNodeRecord, 'position' | 'dimensions'>, target: { x: number; y: number }): { x: number; y: number } {
  const c = center(n);
  const { width, height } = nodeSize(n);
  const dx = target.x - c.x;
  const dy = target.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const sx = dx === 0 ? Infinity : width / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : height / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: c.x + dx * s, y: c.y + dy * s };
}
