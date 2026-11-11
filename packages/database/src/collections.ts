import { UkwError, nowIso, type CollectionEntityType, type CollectionItemRecord, type CollectionRecord } from '@ukw/domain';
import type { StoreContext } from './context';
import { EntityRepo } from './repo';

export interface CollectionNode extends CollectionRecord {
  children: CollectionNode[];
  itemCount: number;
}

export class CollectionRepository extends EntityRepo<CollectionRecord> {
  private readonly items;

  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.collections, 'collections', 'collection');
    this.items = new EntityRepo<CollectionItemRecord>(ctx, ctx.db.collectionItems, 'collectionItems', 'collection item');
  }

  async createCollection(input: { name: string; kind?: CollectionRecord['kind']; parentId?: string | null; description?: string; colour?: string }): Promise<CollectionRecord> {
    const name = input.name.trim();
    if (!name) throw new UkwError('VALIDATION_ERROR', 'A collection needs a name.');
    if (input.parentId) await this.require(input.parentId);
    const siblings = (await this.list()).filter((c) => (c.parentId ?? null) === (input.parentId ?? null));
    return this.create({
      name,
      kind: input.kind ?? 'collection',
      parentId: input.parentId ?? null,
      description: input.description,
      colour: input.colour,
      sortOrder: siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0,
    });
  }

  /** Moves a collection under a new parent, rejecting cycles. */
  async move(id: string, parentId: string | null): Promise<CollectionRecord> {
    if (parentId) {
      if (parentId === id) throw new UkwError('VALIDATION_ERROR', 'A folder cannot contain itself.');
      const all = new Map((await this.list()).map((c) => [c.id, c]));
      for (let cur = all.get(parentId); cur; cur = cur.parentId ? all.get(cur.parentId) : undefined) {
        if (cur.id === id) throw new UkwError('VALIDATION_ERROR', 'A folder cannot be moved into its own subfolder.');
      }
    }
    return this.update(id, { parentId });
  }

  async tree(): Promise<CollectionNode[]> {
    const [cols, items] = await Promise.all([this.list(), this.ctx.db.collectionItems.filter((i) => !i.deletedAt).toArray()]);
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.collectionId, (counts.get(i.collectionId) ?? 0) + 1);
    const nodes = new Map<string, CollectionNode>(cols.map((c) => [c.id, { ...c, children: [], itemCount: counts.get(c.id) ?? 0 }]));
    const roots: CollectionNode[] = [];
    for (const n of nodes.values()) {
      const parent = n.parentId ? nodes.get(n.parentId) : undefined;
      (parent ? parent.children : roots).push(n);
    }
    const sort = (list: CollectionNode[]) => {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
      list.forEach((n) => sort(n.children));
    };
    sort(roots);
    return roots;
  }

  async addItem(collectionId: string, entityType: CollectionEntityType, entityId: string): Promise<CollectionItemRecord> {
    await this.require(collectionId);
    const existing = await this.ctx.db.collectionItems.where('[entityType+entityId]').equals([entityType, entityId]).filter((i) => i.collectionId === collectionId).first();
    if (existing) return existing.deletedAt ? this.items.restore(existing.id) : existing;
    const siblings = await this.ctx.db.collectionItems.where('collectionId').equals(collectionId).filter((i) => !i.deletedAt).toArray();
    return this.items.create({ id: `ci:${collectionId}:${entityType}:${entityId}`, collectionId, entityType, entityId, sortOrder: siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 0 });
  }

  async removeItem(collectionId: string, entityType: CollectionEntityType, entityId: string): Promise<void> {
    const rows = await this.ctx.db.collectionItems.where('[entityType+entityId]').equals([entityType, entityId]).filter((i) => i.collectionId === collectionId && !i.deletedAt).toArray();
    await this.items.bulkRemove(rows.map((r) => r.id), 'Remove from collection');
  }

  async listItems(collectionId: string): Promise<CollectionItemRecord[]> {
    const rows = await this.ctx.db.collectionItems.where('collectionId').equals(collectionId).filter((i) => !i.deletedAt).toArray();
    return rows.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async collectionsFor(entityType: CollectionEntityType, entityId: string): Promise<CollectionRecord[]> {
    const links = await this.ctx.db.collectionItems.where('[entityType+entityId]').equals([entityType, entityId]).filter((i) => !i.deletedAt).toArray();
    const cols = await this.table.bulkGet(links.map((l) => l.collectionId));
    return cols.filter((c): c is CollectionRecord => !!c && !c.deletedAt);
  }

  /** Deleting a collection tombstones its items and re-parents children to the deleted node's parent. */
  override async remove(id: string): Promise<void> {
    await this.ctx.write({ label: 'Delete collection', tables: [this.table, this.ctx.db.collectionItems] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) return;
      const now = nowIso();
      await w.put(this.table, 'collections', 'delete', before, { ...before, deletedAt: now, updatedAt: now, rev: before.rev + 1 });
      for (const child of await this.table.where('parentId').equals(id).toArray()) {
        if (child.deletedAt) continue;
        await w.put(this.table, 'collections', 'update', child, { ...child, parentId: before.parentId ?? null, updatedAt: now, rev: child.rev + 1 });
      }
      for (const it of await this.ctx.db.collectionItems.where('collectionId').equals(id).toArray()) {
        if (it.deletedAt) continue;
        await w.put(this.ctx.db.collectionItems, 'collectionItems', 'delete', it, { ...it, deletedAt: now, updatedAt: now, rev: it.rev + 1 });
      }
    });
  }
}
