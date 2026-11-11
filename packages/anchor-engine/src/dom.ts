import type { TextAnchor } from '@ukw/domain';
import { captureAnchor, type CaptureOptions } from './capture';
import { restoreAnchor, type AnchorMatch, type RestoreResult } from './restore';

/**
 * DOM layer: builds a linear text representation of a document (a "text map") so the pure
 * anchor algorithms can run on a string and results can be turned back into DOM Ranges.
 * Never mutates the page.
 */

export interface TextSegment {
  node: Text;
  /** Start offset of this node's text inside TextMap.text. */
  start: number;
  end: number;
}

export interface TextMap {
  root: Node;
  text: string;
  /** Sorted by start; gaps between segments are virtual block separators. */
  segments: TextSegment[];
  index: Map<Text, TextSegment>;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'SVG', 'CANVAS', 'IFRAME', 'OBJECT']);
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DETAILS', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE',
  'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION',
  'SUMMARY', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
]);

export const UI_ATTRIBUTE = 'data-ukw-ui';

export interface TextMapOptions {
  /** Return true to exclude an element subtree (e.g. adapter-specific chrome). */
  skip?: (el: Element) => boolean;
}

function isSkipped(el: Element, opts: TextMapOptions): boolean {
  if (SKIP_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.hasAttribute(UI_ATTRIBUTE)) return true;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  return opts.skip ? opts.skip(el) : false;
}

function nearestBlock(node: Node): Element | null {
  let el: Node | null = node.parentNode;
  while (el && el.nodeType === 1) {
    if (BLOCK_TAGS.has((el as Element).tagName.toUpperCase())) return el as Element;
    el = el.parentNode;
  }
  return null;
}

export function buildTextMap(root: Node, opts: TextMapOptions = {}): TextMap {
  const doc = root.ownerDocument ?? (root as Document);
  const segments: TextSegment[] = [];
  const index = new Map<Text, TextSegment>();
  const skipCache = new Map<Element, boolean>();
  let text = '';
  let lastBlock: Element | null | undefined;

  const skippedAncestor = (el: Element | null): boolean => {
    const chain: Element[] = [];
    let cur: Element | null = el;
    let result = false;
    while (cur) {
      const cached = skipCache.get(cur);
      if (cached !== undefined) {
        result = cached;
        break;
      }
      chain.push(cur);
      if (isSkipped(cur, opts)) {
        result = true;
        break;
      }
      if (cur === root) break;
      cur = cur.parentElement;
    }
    for (const c of chain) skipCache.set(c, result);
    return result;
  };

  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const data = node.data;
    if (data.length > 0 && !skippedAncestor(node.parentElement)) {
      // Whitespace-only nodes between blocks add no content.
      if (data.trim().length > 0 || (lastBlock !== undefined && nearestBlock(node) === lastBlock)) {
        const block = nearestBlock(node);
        if (lastBlock !== undefined && block !== lastBlock && text.length > 0 && !text.endsWith('\n')) text += '\n';
        lastBlock = block;
        const seg: TextSegment = { node, start: text.length, end: text.length + data.length };
        text += data;
        segments.push(seg);
        index.set(node, seg);
      }
    }
    node = walker.nextNode() as Text | null;
  }
  return { root, text, segments, index };
}

function segmentAtOrAfter(map: TextMap, offset: number): number {
  // first segment with end > offset
  let lo = 0;
  let hi = map.segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (map.segments[mid]!.end > offset) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Creates a DOM Range for text offsets [start, end). Returns null if it cannot be represented. */
export function rangeFromOffsets(map: TextMap, start: number, end: number): Range | null {
  if (end <= start || map.segments.length === 0) return null;
  const si = segmentAtOrAfter(map, start);
  const first = map.segments[si];
  if (!first) return null;
  const ei = segmentAtOrAfter(map, end - 1);
  const last = map.segments[ei];
  if (!last) return null;
  const doc = map.root.ownerDocument ?? (map.root as Document);
  const range = doc.createRange();
  try {
    range.setStart(first.node, Math.max(0, start - first.start));
    range.setEnd(last.node, Math.min(last.node.data.length, end - last.start));
  } catch {
    return null;
  }
  return range.collapsed ? null : range;
}

/** Converts a DOM boundary point to a text offset. */
export function offsetFromPoint(map: TextMap, container: Node, offset: number): number {
  if (container.nodeType === 3) {
    const seg = map.index.get(container as Text);
    if (seg) return seg.start + Math.max(0, Math.min(offset, seg.end - seg.start));
  }
  const doc = map.root.ownerDocument ?? (map.root as Document);
  const probe = doc.createRange();
  try {
    probe.setStart(container, offset);
    probe.collapse(true);
  } catch {
    return map.text.length;
  }
  // Binary search for the first segment whose start point is at or after the boundary.
  let lo = 0;
  let hi = map.segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const cmp = probe.comparePoint(map.segments[mid]!.node, 0); // -1: before boundary, 0: equal, 1: after
    if (cmp >= 0) hi = mid;
    else lo = mid + 1;
  }
  const seg = map.segments[lo];
  return seg ? seg.start : map.text.length;
}

export function offsetsFromRange(map: TextMap, range: Range): { start: number; end: number } | null {
  if (!map.root.contains(range.startContainer) || !map.root.contains(range.endContainer)) return null;
  const start = offsetFromPoint(map, range.startContainer, range.startOffset);
  const end = offsetFromPoint(map, range.endContainer, range.endOffset);
  return end > start ? { start, end } : null;
}

export function captureFromRange(map: TextMap, range: Range, options: CaptureOptions = {}): TextAnchor | null {
  const offsets = offsetsFromRange(map, range);
  if (!offsets) return null;
  return captureAnchor(map.text, offsets.start, offsets.end, options);
}

export interface DomRestoreResult {
  result: RestoreResult;
  range: Range | null;
  candidateRanges: Array<{ match: AnchorMatch; range: Range }>;
}

export function restoreInMap(map: TextMap, anchor: TextAnchor): DomRestoreResult {
  const result = restoreAnchor(map.text, anchor);
  const candidateRanges: Array<{ match: AnchorMatch; range: Range }> = [];
  for (const c of result.candidates) {
    const r = rangeFromOffsets(map, c.start, c.end);
    if (r) candidateRanges.push({ match: c, range: r });
  }
  let range: Range | null = null;
  if (result.status === 'matched') {
    range = rangeFromOffsets(map, result.match.start, result.match.end);
  }
  return { result, range, candidateRanges };
}
