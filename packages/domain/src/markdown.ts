import { DEFAULT_PALETTE, type PaletteColour } from './palette';
import type { AnnotationRecord, NoteRecord } from './types';

export interface MarkdownExportInput {
  title?: string;
  url?: string;
  tags?: string[];
  annotations: AnnotationRecord[];
  notesByAnnotation?: Map<string, NoteRecord[]>;
  documentNotes?: NoteRecord[];
  palette?: readonly PaletteColour[];
  exportedAt?: string;
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim();
const quote = (s: string) => s.trim().split(/\r?\n/).map((l) => `> ${l}`).join('\n');

/** Exports a source's highlights and notes as portable Markdown (FR-ANN-EXPORT). Pure; no HTML is produced. */
export function annotationsToMarkdown(input: MarkdownExportInput): string {
  const palette = input.palette ?? DEFAULT_PALETTE;
  const label = (hex?: string) => palette.find((p) => p.hex.toLowerCase() === hex?.toLowerCase())?.label ?? hex ?? '';
  const out: string[] = [];
  out.push(`# ${oneLine(input.title || input.url || 'Untitled source')}`);
  if (input.url) out.push('', `Source: ${input.url}`);
  if (input.tags?.length) out.push('', `Tags: ${input.tags.join(', ')}`);
  if (input.exportedAt) out.push('', `Exported: ${input.exportedAt.slice(0, 10)}`);

  const live = input.annotations.filter((a) => !a.deletedAt && a.status !== 'archived');
  if (live.length) {
    out.push('', '## Highlights');
    for (const a of live) {
      out.push('');
      if (a.anchor?.exact) out.push(quote(a.anchor.exact));
      else out.push(`**${a.type === 'bookmark' ? 'Bookmark' : 'Sticky note'}:** ${oneLine(a.label ?? '')}`);
      const meta = [a.type !== 'highlight' && a.type !== 'bookmark' && a.type !== 'sticky' ? a.type : '', label(a.colour), a.status === 'orphaned' ? 'location lost' : ''].filter(Boolean);
      if (meta.length) out.push('', `*${meta.join(' · ')}*`);
      for (const n of input.notesByAnnotation?.get(a.id) ?? []) if (!n.deletedAt && n.body.trim()) out.push('', n.body.trim());
    }
  }
  const docNotes = (input.documentNotes ?? []).filter((n) => !n.deletedAt && n.body.trim());
  if (docNotes.length) {
    out.push('', '## Notes');
    for (const n of docNotes) out.push('', ...(n.title ? [`### ${oneLine(n.title)}`, ''] : []), n.body.trim());
  }
  return out.join('\n') + '\n';
}
