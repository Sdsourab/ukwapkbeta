import {
  DEFAULT_HIGHLIGHT_COLOUR,
  UkwError,
  isHexColour,
  nowIso,
  type AnnotationLocation,
  type AnnotationRecord,
  type AnnotationStatus,
  type AnnotationType,
  type NoteRecord,
  type Priority,
  type TextAnchor,
} from '@ukw/domain';
import type { StoreContext } from './context';
import type { NoteRepository } from './notes';
import { EntityRepo, type PatchInput } from './repo';

export interface CreateAnnotationInput {
  documentId: string;
  type: AnnotationType;
  colour?: string;
  anchor: TextAnchor | null;
  location?: AnnotationLocation;
  label?: string;
  priority?: Priority;
  /** Optional note created together with the annotation, in one transaction and one undo step. */
  note?: string;
}

export interface UpdateAnnotationInput extends PatchInput<AnnotationRecord> {}

export class AnnotationRepository extends EntityRepo<AnnotationRecord> {
  constructor(ctx: StoreContext, private readonly notes: NoteRepository) {
    super(ctx, ctx.db.annotations, 'annotations', 'annotation');
  }

  /** Creates an annotation (and optional note) after validating the input (docs/17 §17.7). */
  async createAnnotation(input: CreateAnnotationInput): Promise<{ annotation: AnnotationRecord; note?: NoteRecord }> {
    if (input.type !== 'bookmark' && input.type !== 'sticky' && !input.anchor?.exact?.trim()) {
      throw new UkwError('VALIDATION_ERROR', 'A text selection is required for this annotation type.');
    }
    if (input.colour !== undefined && !isHexColour(input.colour)) throw new UkwError('VALIDATION_ERROR', 'Invalid colour.');
    const doc = await this.ctx.db.documents.get(input.documentId);
    if (!doc || doc.deletedAt) throw new UkwError('NOT_FOUND', 'Document not found.');

    return this.ctx.batch(input.note ? 'Create annotation with note' : `Create ${input.type}`, async () => {
      const annotation = await this.create(
        {
          documentId: input.documentId,
          type: input.type,
          colour: input.type === 'highlight' || input.type === 'sticky' ? (input.colour ?? DEFAULT_HIGHLIGHT_COLOUR) : input.colour,
          anchor: input.anchor,
          location: input.location,
          label: input.label,
          priority: input.priority,
          status: 'active',
          isFavorite: false,
        },
      );
      const body = input.note?.trim();
      const note = body
        ? await this.notes.create({ documentId: input.documentId, annotationId: annotation.id, body, format: 'markdown', pinned: false, isFavorite: false, isArchived: false })
        : undefined;
      return { annotation, note };
    });
  }

  async listByDocument(documentId: string, opts: { includeArchived?: boolean } = {}): Promise<AnnotationRecord[]> {
    const rows = await this.table.where('documentId').equals(documentId).toArray();
    return rows
      .filter((a) => !a.deletedAt && (opts.includeArchived || a.status !== 'archived'))
      .sort((a, b) => (a.anchor?.startOffset ?? Number.MAX_SAFE_INTEGER) - (b.anchor?.startOffset ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt));
  }

  async countsByDocument(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    await this.table.each((a) => {
      if (!a.deletedAt && a.status !== 'archived') counts.set(a.documentId, (counts.get(a.documentId) ?? 0) + 1);
    });
    return counts;
  }

  async setColour(id: string, colour: string): Promise<AnnotationRecord> {
    if (!isHexColour(colour)) throw new UkwError('VALIDATION_ERROR', 'Invalid colour.');
    return this.update(id, { colour });
  }

  /** Records the restoration outcome on page load. Does not create undo history. */
  async reportRestoration(id: string, outcome: { status: Extract<AnnotationStatus, 'active' | 'orphaned'>; confidence?: number; strategy?: TextAnchor['strategy'] }): Promise<AnnotationRecord | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const sameStatus = current.status === outcome.status;
    const sameAnchor = current.anchor?.confidence === outcome.confidence && current.anchor?.strategy === outcome.strategy;
    if (sameStatus && sameAnchor) return current; // avoid write amplification on every page load
    if (current.status === 'archived') return current;
    const anchor = current.anchor ? { ...current.anchor, confidence: outcome.confidence, strategy: outcome.strategy } : current.anchor;
    return this.update(id, { status: outcome.status, anchor }, { history: false });
  }

  /** Replaces the anchor after a user-confirmed manual reattachment and marks the annotation active again. */
  async reattach(id: string, anchor: TextAnchor): Promise<AnnotationRecord> {
    return this.ctx.write({ label: 'Reattach annotation', tables: [this.table] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) throw new UkwError('NOT_FOUND', 'Annotation not found.');
      return w.put(this.table, 'annotations', 'update', before, { ...before, anchor, status: 'active', updatedAt: nowIso(), rev: before.rev + 1 });
    });
  }

  /** Deleting an annotation also tombstones its notes in the same transaction (restorable together). */
  override async remove(id: string): Promise<void> {
    await this.ctx.write({ label: 'Delete annotation', tables: [this.table, this.ctx.db.notes] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) return;
      const now = nowIso();
      await w.put(this.table, 'annotations', 'delete', before, { ...before, deletedAt: now, updatedAt: now, rev: before.rev + 1 });
      const notes = await this.ctx.db.notes.where('annotationId').equals(id).toArray();
      for (const n of notes) {
        if (n.deletedAt) continue;
        await w.put(this.ctx.db.notes, 'notes', 'delete', n, { ...n, deletedAt: now, updatedAt: now, rev: n.rev + 1 });
      }
    });
  }

  override async restore(id: string): Promise<AnnotationRecord> {
    return this.ctx.write({ label: 'Restore annotation', tables: [this.table, this.ctx.db.notes] }, async (w) => {
      const before = await this.table.get(id);
      if (!before) throw new UkwError('NOT_FOUND', 'Annotation not found.');
      if (!before.deletedAt) return before;
      const deletedAt = before.deletedAt;
      const restored = await w.put(this.table, 'annotations', 'restore', before, { ...before, deletedAt: null, updatedAt: nowIso(), rev: before.rev + 1 });
      const notes = await this.ctx.db.notes.where('annotationId').equals(id).toArray();
      for (const n of notes) {
        if (n.deletedAt && n.deletedAt >= deletedAt) {
          await w.put(this.ctx.db.notes, 'notes', 'restore', n, { ...n, deletedAt: null, updatedAt: nowIso(), rev: n.rev + 1 });
        }
      }
      return restored;
    });
  }
}
