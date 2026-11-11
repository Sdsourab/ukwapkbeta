import { UkwError, nowIso, type ReadingProgressRecord, type TextAnchor } from '@ukw/domain';
import type { StoreContext } from './context';
import { EntityRepo } from './repo';

export class ReadingProgressRepository extends EntityRepo<ReadingProgressRecord> {
  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.readingProgress, 'readingProgress', 'reading progress');
  }

  async forDocument(documentId: string): Promise<ReadingProgressRecord | undefined> {
    return this.table.where('documentId').equals(documentId).first();
  }

  /**
   * Saves reading position (docs/07 §7.10): scroll ratio plus heading and text anchor, since ratio alone
   * is unreliable when content length changes. Not part of undo history. Callers should debounce.
   */
  async save(documentId: string, input: { scrollRatio: number; headingId?: string; anchor?: TextAnchor; pageNumber?: number; addSeconds?: number }): Promise<ReadingProgressRecord> {
    if (!Number.isFinite(input.scrollRatio)) throw new UkwError('VALIDATION_ERROR', 'Invalid scroll position.');
    const ratio = Math.max(0, Math.min(1, input.scrollRatio));
    const existing = await this.forDocument(documentId);
    if (existing) {
      return this.update(
        existing.id,
        { scrollRatio: ratio, headingId: input.headingId, anchor: input.anchor, pageNumber: input.pageNumber, secondsRead: existing.secondsRead + Math.max(0, input.addSeconds ?? 0), deletedAt: null },
        { history: false },
      );
    }
    return this.create({ id: `rp:${documentId}`, documentId, scrollRatio: ratio, headingId: input.headingId, anchor: input.anchor, pageNumber: input.pageNumber, secondsRead: Math.max(0, input.addSeconds ?? 0), updatedAt: nowIso() }, { history: false });
  }
}

export type { StoreContext };
