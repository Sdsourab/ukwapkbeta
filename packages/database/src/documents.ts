import { UkwError, newId, nowIso, normalizeUrl, type DocumentRecord, type SourceType } from '@ukw/domain';
import { EntityRepo } from './repo';

export interface PageIdentity {
  url: string;
  title?: string;
  platform?: string;
  externalId?: string;
  sourceType?: SourceType;
  favicon?: string;
}

export class DocumentRepository extends EntityRepo<DocumentRecord> {
  async findByNormalizedUrl(normalizedUrl: string): Promise<DocumentRecord | undefined> {
    const hits = await this.table.where('normalizedUrl').equals(normalizedUrl).toArray();
    return hits.sort((a, b) => Number(!!a.deletedAt) - Number(!!b.deletedAt))[0];
  }

  async findByExternalId(platform: string, externalId: string): Promise<DocumentRecord | undefined> {
    const hits = await this.table.where('externalId').equals(externalId).toArray();
    return hits.find((d) => d.platform === platform && !d.deletedAt);
  }

  /**
   * Finds or creates the document for a page. Never creates duplicates for the same normalised URL
   * (or platform thread id). Restores a soft-deleted document if the user returns to it and annotates.
   */
  async upsertFromPage(identity: PageIdentity): Promise<DocumentRecord> {
    const norm = normalizeUrl(identity.url);
    if (!norm) throw new UkwError('UNSUPPORTED_PAGE', 'This page type cannot be annotated.');

    let existing: DocumentRecord | undefined;
    if (identity.platform && identity.externalId) existing = await this.findByExternalId(identity.platform, identity.externalId);
    existing ??= await this.findByNormalizedUrl(norm.normalized);

    const now = nowIso();
    if (existing) {
      const patch: Partial<DocumentRecord> = { lastVisitedAt: now };
      if (identity.title && identity.title !== existing.title) patch.title = identity.title;
      if (identity.favicon && !existing.favicon) patch.favicon = identity.favicon;
      if (identity.platform && !existing.platform) patch.platform = identity.platform;
      if (identity.externalId && !existing.externalId) patch.externalId = identity.externalId;
      // Skip the write when nothing meaningful changed in the last minute (avoid a write per page visit).
      const recentlyVisited = existing.lastVisitedAt && Date.now() - Date.parse(existing.lastVisitedAt) < 60_000;
      const meaningful = Object.keys(patch).some((k) => k !== 'lastVisitedAt');
      if (existing.deletedAt) await this.restore(existing.id, { history: false });
      if (!recentlyVisited || meaningful) return this.update(existing.id, patch, { history: false });
      return existing.deletedAt ? ((await this.get(existing.id)) as DocumentRecord) : existing;
    }

    return this.create(
      {
        canonicalUrl: norm.original,
        normalizedUrl: norm.normalized,
        hostname: norm.hostname,
        title: identity.title,
        sourceType: identity.sourceType ?? (identity.platform ? 'conversation' : 'web'),
        platform: identity.platform,
        externalId: identity.externalId,
        favicon: identity.favicon,
        lastVisitedAt: now,
        isFavorite: false,
        isArchived: false,
      },
      { history: false },
    );
  }

  /** Creates a manual (typed/pasted) source. */
  async createManual(input: { title: string; content?: string; url?: string }): Promise<DocumentRecord> {
    const title = input.title.trim();
    if (!title) throw new UkwError('VALIDATION_ERROR', 'A title is required.');
    const norm = input.url ? normalizeUrl(input.url) : null;
    const id = newId();
    return this.create({
      id,
      canonicalUrl: norm?.original ?? `ukw://manual/${id}`,
      normalizedUrl: norm?.normalized ?? `ukw://manual/${id}`,
      hostname: norm?.hostname,
      title,
      sourceType: 'manual',
      content: input.content,
      isFavorite: false,
      isArchived: false,
    });
  }

  async setFavorite(id: string, value: boolean): Promise<DocumentRecord> {
    return this.update(id, { isFavorite: value });
  }

  async setArchived(id: string, value: boolean): Promise<DocumentRecord> {
    return this.update(id, { isArchived: value });
  }

  /** Deleting a document also tombstones its annotations, notes and reading progress (restorable together). */
  override async remove(id: string): Promise<void> {
    const { db } = this.ctx;
    await this.ctx.write({ label: 'Delete document', tables: [this.table, db.annotations, db.notes, db.readingProgress] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) return;
      const now = nowIso();
      await w.put(this.table, 'documents', 'delete', before, { ...before, deletedAt: now, updatedAt: now, rev: before.rev + 1 });
      for (const a of await db.annotations.where('documentId').equals(id).toArray()) {
        if (!a.deletedAt) await w.put(db.annotations, 'annotations', 'delete', a, { ...a, deletedAt: now, updatedAt: now, rev: a.rev + 1 });
      }
      for (const n of await db.notes.where('documentId').equals(id).toArray()) {
        if (!n.deletedAt) await w.put(db.notes, 'notes', 'delete', n, { ...n, deletedAt: now, updatedAt: now, rev: n.rev + 1 });
      }
      const rp = await db.readingProgress.where('documentId').equals(id).first();
      if (rp && !rp.deletedAt) await w.put(db.readingProgress, 'readingProgress', 'delete', rp, { ...rp, deletedAt: now, updatedAt: now, rev: rp.rev + 1 });
    });
  }

  override async restore(id: string, opts: { history?: boolean } = {}): Promise<DocumentRecord> {
    const { db } = this.ctx;
    return this.ctx.write({ label: 'Restore document', history: opts.history, tables: [this.table, db.annotations, db.notes, db.readingProgress] }, async (w) => {
      const before = await this.table.get(id);
      if (!before) throw new UkwError('NOT_FOUND', 'Document not found.');
      if (!before.deletedAt) return before;
      const stamp = before.deletedAt;
      const restored = await w.put(this.table, 'documents', 'restore', before, { ...before, deletedAt: null, updatedAt: nowIso(), rev: before.rev + 1 });
      for (const a of await db.annotations.where('documentId').equals(id).toArray()) {
        if (a.deletedAt && a.deletedAt >= stamp) await w.put(db.annotations, 'annotations', 'restore', a, { ...a, deletedAt: null, updatedAt: nowIso(), rev: a.rev + 1 });
      }
      for (const n of await db.notes.where('documentId').equals(id).toArray()) {
        if (n.deletedAt && n.deletedAt >= stamp) await w.put(db.notes, 'notes', 'restore', n, { ...n, deletedAt: null, updatedAt: nowIso(), rev: n.rev + 1 });
      }
      const rp = await db.readingProgress.where('documentId').equals(id).first();
      if (rp?.deletedAt && rp.deletedAt >= stamp) await w.put(db.readingProgress, 'readingProgress', 'restore', rp, { ...rp, deletedAt: null, updatedAt: nowIso(), rev: rp.rev + 1 });
      return restored;
    });
  }
}
