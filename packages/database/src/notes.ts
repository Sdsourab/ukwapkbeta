import { UkwError, type NoteRecord } from '@ukw/domain';
import { EntityRepo } from './repo';

export const MAX_NOTE_LENGTH = 200_000;

export class NoteRepository extends EntityRepo<NoteRecord> {
  async listForDocument(documentId: string): Promise<NoteRecord[]> {
    const rows = await this.table.where('documentId').equals(documentId).toArray();
    return rows.filter((n) => !n.deletedAt && !n.isArchived).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listForAnnotation(annotationId: string): Promise<NoteRecord[]> {
    const rows = await this.table.where('annotationId').equals(annotationId).toArray();
    return rows.filter((n) => !n.deletedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  /**
   * Autosave entry point: creates the note on first save, then updates it. Writes never go through
   * undo history per keystroke (the UI debounces; note edits are not individually undoable).
   */
  async save(input: { id?: string; documentId?: string; annotationId?: string; title?: string; body: string; format?: NoteRecord['format'] }): Promise<NoteRecord> {
    if (input.body.length > MAX_NOTE_LENGTH) throw new UkwError('VALIDATION_ERROR', `Notes are limited to ${MAX_NOTE_LENGTH.toLocaleString()} characters.`);
    if (input.id) {
      return this.update(input.id, { body: input.body, ...(input.title !== undefined ? { title: input.title } : {}), ...(input.format ? { format: input.format } : {}) }, { history: false });
    }
    return this.create({
      documentId: input.documentId,
      annotationId: input.annotationId,
      title: input.title,
      body: input.body,
      format: input.format ?? 'markdown',
      pinned: false,
      isFavorite: false,
      isArchived: false,
    });
  }

  async setPinned(id: string, pinned: boolean): Promise<NoteRecord> {
    return this.update(id, { pinned });
  }
}
