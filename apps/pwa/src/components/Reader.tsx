import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildTextMap, captureFromRange, restoreAnchor, type RestoreResult } from '@ukw/anchor-engine';
import { DEFAULT_HIGHLIGHT_COLOUR, hexToRgba, type AnnotationRecord, type TextAnchor } from '@ukw/domain';

export function paragraphsOf(content: string): string[] {
  return content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
}

export interface RestoredRange {
  annotation: AnnotationRecord;
  start: number;
  end: number;
}

export interface ReaderRestoration {
  ranges: RestoredRange[];
  results: Map<string, RestoreResult>;
}

/** Restores every anchored annotation against the reader text. Pure and deterministic. */
export function restoreAll(readerText: string, annotations: AnnotationRecord[]): ReaderRestoration {
  const ranges: RestoredRange[] = [];
  const results = new Map<string, RestoreResult>();
  for (const a of annotations) {
    if (!a.anchor || a.type === 'bookmark' || a.type === 'sticky' || a.status === 'archived') continue;
    const r = restoreAnchor(readerText, a.anchor);
    results.set(a.id, r);
    if (r.status === 'matched') ranges.push({ annotation: a, start: r.match.start, end: r.match.end });
  }
  return { ranges, results };
}

interface Piece { text: string; covering: AnnotationRecord[] }

/** Splits one paragraph [pStart, pEnd) into pieces by the restored ranges that cover it. */
export function piecesFor(text: string, pStart: number, ranges: RestoredRange[]): Piece[] {
  const pEnd = pStart + text.length;
  const hit = ranges.filter((r) => r.start < pEnd && r.end > pStart);
  if (hit.length === 0) return [{ text, covering: [] }];
  const cuts = new Set<number>([pStart, pEnd]);
  for (const r of hit) { cuts.add(Math.max(pStart, r.start)); cuts.add(Math.min(pEnd, r.end)); }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: Piece[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!, b = sorted[i + 1]!;
    if (b <= a) continue;
    const covering = hit.filter((r) => r.start <= a && r.end >= b).map((r) => r.annotation).sort((x, y) => x.createdAt.localeCompare(y.createdAt));
    out.push({ text: text.slice(a - pStart, b - pStart), covering });
  }
  return out;
}

export interface PendingSelection { anchor: TextAnchor }

/**
 * Renders a text source with highlights drawn from anchors, and reports user selections as anchors.
 * Highlights are React-rendered <mark> elements (no DOM patching), so they survive re-renders.
 */
export function Reader({ content, annotations, activeId, onPick, onSelection, renderExtra }: {
  content: string;
  annotations: AnnotationRecord[];
  activeId?: string | null;
  onPick: (id: string) => void;
  onSelection: (sel: PendingSelection | null) => void;
  renderExtra?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const paragraphs = useMemo(() => paragraphsOf(content), [content]);
  const readerText = useMemo(() => paragraphs.join('\n'), [paragraphs]);
  const restoration = useMemo(() => restoreAll(readerText, annotations), [readerText, annotations]);
  const [, force] = useState(0);

  const emitSelection = useCallback(() => {
    const root = ref.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) { onSelection(null); return; }
    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) { onSelection(null); return; }
    const anchor = captureFromRange(buildTextMap(root), range);
    onSelection(anchor ? { anchor } : null);
  }, [onSelection]);

  useEffect(() => {
    const handler = () => { window.clearTimeout((handler as unknown as { t?: number }).t); (handler as unknown as { t?: number }).t = window.setTimeout(emitSelection, 120); };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, [emitSelection]);

  useEffect(() => { force((n) => n + 1); }, [activeId]);

  let offset = 0;
  return (
    <div className="card reader" ref={ref} lang="und">
      {paragraphs.map((p, i) => {
        const start = offset;
        offset += p.length + 1; // paragraphs are joined by "\n"
        return (
          <p key={i} data-start={start}>
            {piecesFor(p, start, restoration.ranges).map((piece, j) => {
              if (piece.covering.length === 0) return piece.text;
              const top = piece.covering[piece.covering.length - 1]!;
              const active = piece.covering.some((a) => a.id === activeId);
              return (
                <mark
                  key={j}
                  data-ann={top.id}
                  data-type={top.type}
                  className={active ? 'is-active' : undefined}
                  style={{ ['--hl' as string]: hexToRgba(top.colour ?? DEFAULT_HIGHLIGHT_COLOUR, top.type === 'highlight' ? 0.55 : 1) }}
                  onClick={() => onPick(top.id)}
                >
                  {piece.text}
                </mark>
              );
            })}
          </p>
        );
      })}
      {renderExtra}
    </div>
  );
}

export function readerTextOf(content: string): string {
  return paragraphsOf(content).join('\n');
}
