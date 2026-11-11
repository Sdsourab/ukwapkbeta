import type { Table } from 'dexie';
import { UkwError, nowIso, type BaseRecord, type SyncEntityType } from '@ukw/domain';
import { stamp, type StoreContext } from './context';

export type CreateInput<T extends BaseRecord> = Omit<T, keyof BaseRecord> & Partial<BaseRecord>;
export type PatchInput<T extends BaseRecord> = Partial<Omit<T, 'id' | 'createdAt' | 'schemaVersion' | 'rev'>>;

export interface WriteOptions {
  /** Set false for internal operations that must not appear in undo history. */
  history?: boolean;
}

/** Generic CRUD with soft delete, revisions, outbox and undo support. */
export class EntityRepo<T extends BaseRecord> {
  constructor(
    protected readonly ctx: StoreContext,
    readonly table: Table<T, string>,
    readonly entityType: SyncEntityType,
    readonly label: string,
  ) {}

  async create(input: CreateInput<T>, opts: WriteOptions = {}): Promise<T> {
    const record = stamp<T>(input);
    return this.ctx.write({ label: `Create ${this.label}`, history: opts.history, tables: [this.table] }, (w) =>
      w.put(this.table, this.entityType, 'create', undefined, record),
    );
  }

  async get(id: string, includeDeleted = false): Promise<T | undefined> {
    const rec = await this.table.get(id);
    if (!rec) return undefined;
    return !includeDeleted && rec.deletedAt ? undefined : rec;
  }

  async require(id: string): Promise<T> {
    const rec = await this.get(id);
    if (!rec) throw new UkwError('NOT_FOUND', `${this.label} not found`);
    return rec;
  }

  async list(includeDeleted = false): Promise<T[]> {
    const all = await this.table.toArray();
    return includeDeleted ? all : all.filter((r) => !r.deletedAt);
  }

  async count(): Promise<number> {
    return (await this.table.filter((r) => !r.deletedAt).count());
  }

  async update(id: string, patch: PatchInput<T>, opts: WriteOptions = {}): Promise<T> {
    return this.ctx.write({ label: `Edit ${this.label}`, history: opts.history, tables: [this.table] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) throw new UkwError('NOT_FOUND', `${this.label} not found`);
      const after = { ...before, ...patch, updatedAt: nowIso(), rev: before.rev + 1 } as T;
      return w.put(this.table, this.entityType, 'update', before, after);
    });
  }

  async bulkUpdate(ids: string[], patch: PatchInput<T>, label = `Edit ${this.label}s`): Promise<number> {
    return this.ctx.write({ label, tables: [this.table] }, async (w) => {
      let n = 0;
      for (const id of ids) {
        const before = await this.table.get(id);
        if (!before || before.deletedAt) continue;
        await w.put(this.table, this.entityType, 'update', before, { ...before, ...patch, updatedAt: nowIso(), rev: before.rev + 1 } as T);
        n++;
      }
      return n;
    });
  }

  /** Soft delete (tombstone). Recoverable from Trash until purged. */
  async remove(id: string, opts: WriteOptions = {}): Promise<void> {
    await this.ctx.write({ label: `Delete ${this.label}`, history: opts.history, tables: [this.table] }, async (w) => {
      const before = await this.table.get(id);
      if (!before || before.deletedAt) return;
      const now = nowIso();
      await w.put(this.table, this.entityType, 'delete', before, { ...before, deletedAt: now, updatedAt: now, rev: before.rev + 1 } as T);
    });
  }

  async bulkRemove(ids: string[], label = `Delete ${this.label}s`): Promise<number> {
    return this.ctx.write({ label, tables: [this.table] }, async (w) => {
      let n = 0;
      for (const id of ids) {
        const before = await this.table.get(id);
        if (!before || before.deletedAt) continue;
        const now = nowIso();
        await w.put(this.table, this.entityType, 'delete', before, { ...before, deletedAt: now, updatedAt: now, rev: before.rev + 1 } as T);
        n++;
      }
      return n;
    });
  }

  async restore(id: string, opts: WriteOptions = {}): Promise<T> {
    return this.ctx.write({ label: `Restore ${this.label}`, history: opts.history, tables: [this.table] }, async (w) => {
      const before = await this.table.get(id);
      if (!before) throw new UkwError('NOT_FOUND', `${this.label} not found`);
      if (!before.deletedAt) return before;
      return w.put(this.table, this.entityType, 'restore', before, { ...before, deletedAt: null, updatedAt: nowIso(), rev: before.rev + 1 } as T);
    });
  }

  /** Permanent removal. Explicit, separate from delete (docs/05 §5.7). */
  async purge(id: string): Promise<void> {
    await this.ctx.write({ label: `Purge ${this.label}`, history: false, tables: [this.table] }, async (w) => {
      const before = await this.table.get(id);
      if (before) await w.purge(this.table, this.entityType, before);
    });
  }

  async listDeleted(): Promise<T[]> {
    return this.table.filter((r) => !!r.deletedAt).toArray();
  }
}
