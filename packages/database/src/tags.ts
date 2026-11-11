import { UkwError, nowIso, type TagRecord, type TaggingRecord, type Taggable } from '@ukw/domain';
import type { StoreContext } from './context';
import { EntityRepo } from './repo';

export function tagKey(name: string): string {
  return name.trim().normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
}

export class TagRepository extends EntityRepo<TagRecord> {
  private readonly taggings;

  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.tags, 'tags', 'tag');
    this.taggings = new EntityRepo<TaggingRecord>(ctx, ctx.db.taggings, 'taggings', 'tagging');
  }

  /** Returns the existing tag with that (case-insensitive) name, restoring it if tombstoned, else creates it. */
  async ensure(name: string, colour?: string): Promise<TagRecord> {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new UkwError('VALIDATION_ERROR', 'A tag needs a name.');
    if (clean.length > 60) throw new UkwError('VALIDATION_ERROR', 'Tag names are limited to 60 characters.');
    const key = tagKey(clean);
    const existing = await this.table.where('nameKey').equals(key).first();
    if (existing) return existing.deletedAt ? this.restore(existing.id, { history: false }) : existing;
    // Deterministic id: two devices creating the same tag produce the same record (no sync clash).
    return this.create({ id: `tag:${key}`, name: clean, nameKey: key, colour }, { history: false });
  }

  async rename(id: string, name: string): Promise<TagRecord> {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new UkwError('VALIDATION_ERROR', 'A tag needs a name.');
    const key = tagKey(clean);
    const clash = await this.table.where('nameKey').equals(key).first();
    if (clash && clash.id !== id) throw new UkwError('CONFLICT', `A tag named "${clash.name}" already exists.`);
    return this.update(id, { name: clean, nameKey: key });
  }

  async attach(tagId: string, entityType: Taggable, entityId: string): Promise<TaggingRecord> {
    const existing = await this.ctx.db.taggings.where('[entityType+entityId]').equals([entityType, entityId]).filter((t) => t.tagId === tagId).first();
    if (existing) return existing.deletedAt ? this.taggings.restore(existing.id) : existing;
    return this.taggings.create({ id: `tg:${tagId}:${entityType}:${entityId}`, tagId, entityType, entityId });
  }

  async detach(tagId: string, entityType: Taggable, entityId: string): Promise<void> {
    const rows = await this.ctx.db.taggings.where('[entityType+entityId]').equals([entityType, entityId]).filter((t) => t.tagId === tagId && !t.deletedAt).toArray();
    await this.taggings.bulkRemove(rows.map((r) => r.id), 'Remove tag');
  }

  async listForEntity(entityType: Taggable, entityId: string): Promise<TagRecord[]> {
    const links = await this.ctx.db.taggings.where('[entityType+entityId]').equals([entityType, entityId]).filter((t) => !t.deletedAt).toArray();
    const tags = await this.table.bulkGet(links.map((l) => l.tagId));
    return tags.filter((t): t is TagRecord => !!t && !t.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Replaces an entity's tag set by names (creating tags as needed). */
  async setForEntity(entityType: Taggable, entityId: string, names: string[]): Promise<TagRecord[]> {
    const wanted = new Map<string, string>();
    for (const n of names) {
      const k = tagKey(n);
      if (k) wanted.set(k, n);
    }
    return this.ctx.batch('Edit tags', async () => {
      const current = await this.listForEntity(entityType, entityId);
      const currentKeys = new Set(current.map((t) => t.nameKey));
      for (const t of current) if (!wanted.has(t.nameKey)) await this.detach(t.id, entityType, entityId);
      for (const [k, n] of wanted) {
        if (currentKeys.has(k)) continue;
        const tag = await this.ensure(n);
        await this.attach(tag.id, entityType, entityId);
      }
      return this.listForEntity(entityType, entityId);
    });
  }

  /** Tags with usage counts for the filter UI. */
  async listWithCounts(): Promise<Array<TagRecord & { count: number }>> {
    const [tags, links] = await Promise.all([this.list(), this.ctx.db.taggings.filter((t) => !t.deletedAt).toArray()]);
    const counts = new Map<string, number>();
    for (const l of links) counts.set(l.tagId, (counts.get(l.tagId) ?? 0) + 1);
    return tags.map((t) => ({ ...t, count: counts.get(t.id) ?? 0 })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /** Tombstones the tag and its taggings together. */
  override async remove(id: string): Promise<void> {
    await this.ctx.write({ label: 'Delete tag', tables: [this.table, this.ctx.db.taggings] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) return;
      const now = nowIso();
      await w.put(this.table, 'tags', 'delete', before, { ...before, deletedAt: now, updatedAt: now, rev: before.rev + 1 });
      const links = await this.ctx.db.taggings.where('tagId').equals(id).toArray();
      for (const l of links) {
        if (l.deletedAt) continue;
        await w.put(this.ctx.db.taggings, 'taggings', 'delete', l, { ...l, deletedAt: now, updatedAt: now, rev: l.rev + 1 });
      }
    });
  }
}

