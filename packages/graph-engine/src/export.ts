import {
  SCHEMA_VERSION,
  newId,
  nowIso,
  type ConnectorStyle,
  type GraphEdgeRecord,
  type GraphKind,
  type GraphNodeRecord,
  type GraphNodeType,
  type GraphRecord,
  type GraphViewport,
  type NodeShape,
} from '@ukw/domain';
import { z } from 'zod';
import { boundaryPoint, boundingBox, center, nodeSize } from './geometry';

/** Versioned graph export (docs/07 §7.6): nodes, edges, viewport and schema version. */
export const GRAPH_EXPORT_FORMAT = 'ukw-graph' as const;

export interface GraphExport {
  format: typeof GRAPH_EXPORT_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  graph: Pick<GraphRecord, 'title' | 'kind' | 'viewport' | 'gridEnabled' | 'snapEnabled' | 'description'> & { id: string };
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
}

export function serializeGraph(graph: GraphRecord, nodes: GraphNodeRecord[], edges: GraphEdgeRecord[]): GraphExport {
  return {
    format: GRAPH_EXPORT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso(),
    graph: {
      id: graph.id,
      title: graph.title,
      kind: graph.kind,
      viewport: graph.viewport,
      gridEnabled: graph.gridEnabled,
      snapEnabled: graph.snapEnabled,
      description: graph.description,
    },
    nodes: nodes.filter((n) => !n.deletedAt),
    edges: edges.filter((e) => !e.deletedAt),
  };
}

const num = z.number().finite();
const nodeSchema = z.looseObject({
  id: z.string().min(1).max(200),
  type: z.string().min(1),
  label: z.string().max(5000),
  position: z.looseObject({ x: num, y: num }),
});
const edgeSchema = z.looseObject({
  id: z.string().min(1).max(200),
  sourceNodeId: z.string().min(1),
  targetNodeId: z.string().min(1),
  directed: z.boolean().optional(),
});
const exportSchema = z.looseObject({
  format: z.literal(GRAPH_EXPORT_FORMAT),
  schemaVersion: z.number().int().min(1),
  graph: z.looseObject({ title: z.string().max(500), kind: z.string().optional() }),
  nodes: z.array(z.unknown()).max(50_000),
  edges: z.array(z.unknown()).max(200_000),
});

export interface ParsedGraphImport {
  graph: GraphExport['graph'];
  nodes: GraphNodeRecord[];
  edges: GraphEdgeRecord[];
  /** Problems found and repaired or skipped (reported, never silent). */
  warnings: string[];
}

const NODE_TYPES: readonly GraphNodeType[] = ['text', 'source', 'note', 'claim', 'evidence', 'question', 'image', 'task', 'group'];
const SHAPES: readonly NodeShape[] = ['rounded', 'rect', 'ellipse', 'diamond', 'pill'];
const CONNECTORS: readonly ConnectorStyle[] = ['straight', 'curved', 'orthogonal'];
const KINDS: readonly GraphKind[] = ['knowledge', 'mindmap', 'concept', 'flowchart', 'timeline', 'decision', 'evidence', 'hierarchy', 'freeform'];

/**
 * Validates an exported graph and builds records with fresh ids (so importing never overwrites
 * an existing graph). Edges that reference missing nodes are skipped and reported.
 */
export function parseGraphImport(raw: unknown): { ok: true; data: ParsedGraphImport } | { ok: false; error: string } {
  const parsed = exportSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: `Not a valid UKW graph file: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
  if (parsed.data.schemaVersion > SCHEMA_VERSION) return { ok: false, error: 'This graph was exported by a newer version of the app.' };

  const warnings: string[] = [];
  const now = nowIso();
  const graphId = newId();
  const idMap = new Map<string, string>();
  const nodes: GraphNodeRecord[] = [];

  for (const [i, rawNode] of parsed.data.nodes.entries()) {
    const n = nodeSchema.safeParse(rawNode);
    if (!n.success) {
      warnings.push(`Skipped node #${i + 1}: ${n.error.issues[0]?.message ?? 'invalid'}`);
      continue;
    }
    const src = n.data as Record<string, any>;
    if (idMap.has(src.id)) {
      warnings.push(`Skipped node #${i + 1}: duplicate id.`);
      continue;
    }
    const id = newId();
    idMap.set(src.id, id);
    const dims = src.dimensions && num.safeParse(src.dimensions.width).success && num.safeParse(src.dimensions.height).success ? { width: src.dimensions.width, height: src.dimensions.height } : undefined;
    nodes.push({
      ...src,
      id,
      graphId,
      type: (NODE_TYPES as readonly string[]).includes(src.type) ? src.type : 'text',
      shape: (SHAPES as readonly string[]).includes(src.shape) ? src.shape : 'rounded',
      dimensions: dims,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      schemaVersion: SCHEMA_VERSION,
      rev: 1,
    } as GraphNodeRecord);
  }
  // Remap group membership after all ids exist.
  for (const n of nodes) {
    if (n.groupId) {
      const mapped = idMap.get(n.groupId);
      if (mapped) n.groupId = mapped;
      else {
        warnings.push(`Node "${n.label || n.id}" referenced a missing group; it was ungrouped.`);
        n.groupId = null;
      }
    }
  }

  const edges: GraphEdgeRecord[] = [];
  for (const [i, rawEdge] of parsed.data.edges.entries()) {
    const e = edgeSchema.safeParse(rawEdge);
    if (!e.success) {
      warnings.push(`Skipped edge #${i + 1}: ${e.error.issues[0]?.message ?? 'invalid'}`);
      continue;
    }
    const src = e.data as Record<string, any>;
    const s = idMap.get(src.sourceNodeId);
    const t = idMap.get(src.targetNodeId);
    if (!s || !t) {
      warnings.push(`Skipped edge #${i + 1}: it points to a node that is not in the file.`);
      continue;
    }
    edges.push({
      ...src,
      id: newId(),
      graphId,
      sourceNodeId: s,
      targetNodeId: t,
      directed: src.directed ?? true,
      connector: (CONNECTORS as readonly string[]).includes(src.connector) ? src.connector : 'curved',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      schemaVersion: SCHEMA_VERSION,
      rev: 1,
    } as GraphEdgeRecord);
  }

  const g = parsed.data.graph as Record<string, any>;
  const vp = g.viewport as Partial<GraphViewport> | undefined;
  return {
    ok: true,
    data: {
      graph: {
        id: graphId,
        title: String(g.title || 'Imported graph').slice(0, 500),
        kind: (KINDS as readonly string[]).includes(g.kind) ? g.kind : 'knowledge',
        viewport: { x: Number(vp?.x) || 0, y: Number(vp?.y) || 0, zoom: Number(vp?.zoom) || 1 },
        gridEnabled: g.gridEnabled ?? true,
        snapEnabled: g.snapEnabled ?? false,
        description: typeof g.description === 'string' ? g.description : undefined,
      },
      nodes,
      edges,
      warnings,
    },
  };
}

/* ---------------------------------------------------------------- SVG export */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const SAFE_COLOUR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const colour = (c: string | undefined, fallback: string) => (c && SAFE_COLOUR.test(c) ? c : fallback);

function wrap(label: string, maxChars: number, maxLines: number): string[] {
  const words = label.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1]!.slice(0, Math.max(1, maxChars - 1)) + '…';
    return kept;
  }
  return lines;
}

export interface SvgOptions {
  padding?: number;
  background?: string;
  textColour?: string;
  nodeFill?: string;
  stroke?: string;
}

/** Standalone SVG (no scripts, no external references). All text and colours are escaped/validated. */
export function graphToSvg(title: string, nodes: GraphNodeRecord[], edges: GraphEdgeRecord[], opts: SvgOptions = {}): string {
  const pad = opts.padding ?? 40;
  const live = nodes.filter((n) => !n.deletedAt);
  const box = boundingBox(live);
  const w = Math.max(200, box.width + pad * 2);
  const h = Math.max(120, box.height + pad * 2);
  const ox = pad - box.x;
  const oy = pad - box.y;
  const byId = new Map(live.map((n) => [n.id, n]));
  const textColour = colour(opts.textColour, '#172033');
  const stroke = colour(opts.stroke, '#5267e8');
  const out: string[] = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">`);
  out.push(`<title>${esc(title)}</title>`);
  out.push(`<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${stroke}"/></marker></defs>`);
  if (opts.background) out.push(`<rect width="100%" height="100%" fill="${colour(opts.background, '#ffffff')}"/>`);

  for (const e of edges) {
    if (e.deletedAt) continue;
    const s = byId.get(e.sourceNodeId);
    const t = byId.get(e.targetNodeId);
    if (!s || !t) continue;
    const sc = center(s), tc = center(t);
    const a = boundaryPoint(s, tc), b = boundaryPoint(t, sc);
    const ax = a.x + ox, ay = a.y + oy, bx = b.x + ox, by = b.y + oy;
    let d: string;
    if (e.connector === 'orthogonal') {
      const mx = (ax + bx) / 2;
      d = `M${ax},${ay} L${mx},${ay} L${mx},${by} L${bx},${by}`;
    } else if (e.connector === 'straight') {
      d = `M${ax},${ay} L${bx},${by}`;
    } else {
      const dx = (bx - ax) / 2;
      d = `M${ax},${ay} C${ax + dx},${ay} ${bx - dx},${by} ${bx},${by}`;
    }
    out.push(`<path d="${d}" fill="none" stroke="${colour(e.colour, stroke)}" stroke-width="1.8"${e.directed ? ' marker-end="url(#arrow)"' : ''}/>`);
    if (e.label) out.push(`<text x="${(ax + bx) / 2}" y="${(ay + by) / 2 - 6}" font-size="12" text-anchor="middle" fill="${textColour}">${esc(e.label)}</text>`);
  }

  // Groups first so members draw on top.
  const ordered = [...live].sort((a, b) => Number(b.type === 'group') - Number(a.type === 'group'));
  for (const n of ordered) {
    const { width, height } = nodeSize(n);
    const x = n.position.x + ox, y = n.position.y + oy;
    const fill = n.type === 'group' ? 'none' : colour(n.colour, opts.nodeFill ?? '#ffffff');
    const sw = n.type === 'group' ? `stroke="${stroke}" stroke-dasharray="6 4"` : `stroke="${stroke}"`;
    const attrs = `fill="${fill}" ${sw} stroke-width="1.5"`;
    switch (n.shape) {
      case 'ellipse': out.push(`<ellipse cx="${x + width / 2}" cy="${y + height / 2}" rx="${width / 2}" ry="${height / 2}" ${attrs}/>`); break;
      case 'diamond': out.push(`<polygon points="${x + width / 2},${y} ${x + width},${y + height / 2} ${x + width / 2},${y + height} ${x},${y + height / 2}" ${attrs}/>`); break;
      case 'pill': out.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="${height / 2}" ${attrs}/>`); break;
      case 'rect': out.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" ${attrs}/>`); break;
      default: out.push(`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" ${attrs}/>`);
    }
    const lines = wrap(n.label, Math.max(6, Math.floor(width / 7.5)), Math.max(1, Math.floor((height - 12) / 16)));
    const startY = n.type === 'group' ? y + 18 : y + height / 2 - ((lines.length - 1) * 16) / 2 + 4;
    const anchor = n.type === 'group' ? 'start' : 'middle';
    const tx = n.type === 'group' ? x + 10 : x + width / 2;
    lines.forEach((line, i) => out.push(`<text x="${tx}" y="${startY + i * 16}" font-size="13" text-anchor="${anchor}" fill="${textColour}">${esc(line)}</text>`));
  }
  out.push('</svg>');
  return out.join('\n');
}
