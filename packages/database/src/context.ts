import type { Table } from 'dexie';
import {
  SCHEMA_VERSION,
  UkwError,
  newId,
  nowIso,
  type AuditEventRecord,
  type BaseRecord,
  type SyncEntityType,
} from '@ukw/domain';
import type { UkwDatabase } from './db';

export type ChangeOp = 'create' | 'update' | 'delete' | 'restore' | 'purge' | 'import';

export interface ChangeEvent {
  /** Entity types touched by a committed write. */
  entityTypes: SyncEntityType[];
  /** Ids touched, per entity type. */
  ids: Partial<Record<SyncEntityType, string[]>>;
  op: ChangeOp | 'history';
  /** True when the event came from another tab/context through BroadcastChannel. */
  remote?: boolean;
}

export interface Trace {
  entityType: SyncEntityType;
  id: string;
  op: ChangeOp;
  before: BaseRecord | undefined;
  after: BaseRecord | undefined;
}

export interface HistoryEntry {
  label: string;
  traces: Trace[];
}

export interface WriteScope {
  /** Inserts or replaces a record, enqueueing sync and audit entries. */
  put<T extends BaseRecord>(table: Table<T, string>, entityType: SyncEntityType, op: ChangeOp, before: T | undefined, after: T): Promise<T>;
  /** Permanently removes a record (not undoable). */
  purge<T extends BaseRecord>(table: Table<T, string>, entityType: SyncEntityType, before: T): Promise<void>;
}

const HISTORY_LIMIT = 100;
const CHANNEL = 'ukw-changes';

export function stamp<T extends BaseRecord>(rec: Omit<T, keyof BaseRecord> & Partial<BaseRecord>): T {
  const now = nowIso();
  return {
    ...rec,
    id: rec.id ?? newId(),
    createdAt: rec.createdAt ?? now,
    updatedAt: rec.updatedAt ?? now,
    schemaVersion: rec.schemaVersion ?? SCHEMA_VERSION,
    rev: rec.rev ?? 1,
  } as T;
}

/**
 * Shared plumbing for repositories: transactional writes with sync outbox + audit trail,
 * change notification, and undo/redo history.
 */
export class StoreContext {
  private listeners = new Set<(e: ChangeEvent) => void>();
  private channel: BroadcastChannel | null = null;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private batchEntry: HistoryEntry | null = null;
  private tables = new Map<SyncEntityType, Table<BaseRecord, string>>();

  constructor(readonly db: UkwDatabase, opts: { broadcast?: boolean } = {}) {
    for (const name of [
      'documents', 'annotations', 'notes', 'tags', 'taggings', 'collections', 'collectionItems', 'graphs', 'nodes',
      'edges', 'researchProjects', 'references', 'matrices', 'tasks', 'readingProgress',
    ] as const) {
      this.tables.set(name, db[name] as unknown as Table<BaseRecord, string>);
    }
    if (opts.broadcast !== false && typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(`${CHANNEL}:${db.name}`);
        this.channel.onmessage = (ev: MessageEvent) => {
          const data = ev.data as ChangeEvent | undefined;
          if (data && Array.isArray(data.entityTypes)) this.dispatch({ ...data, remote: true });
        };
      } catch {
        this.channel = null;
      }
    }
  }

  close(): void {
    this.channel?.close();
    this.channel = null;
    this.listeners.clear();
  }

  subscribe(listener: (e: ChangeEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private dispatch(event: ChangeEvent): void {
    for (const l of [...this.listeners]) {
      try {
        l(event);
      } catch (err) {
        console.error('[ukw] change listener failed', err);
      }
    }
  }

  private emit(event: ChangeEvent): void {
    this.dispatch(event);
    try {
      this.channel?.postMessage(event);
    } catch {
      /* channel closed */
    }
  }

  tableFor(entityType: SyncEntityType): Table<BaseRecord, string> {
    const t = this.tables.get(entityType);
    if (!t) throw new UkwError('INTERNAL_ERROR', `No table for entity type ${entityType}`);
    return t;
  }

  /** Runs `fn` in a single transaction touching `tables` plus the outbox and audit tables. */
  async write<R>(
    opts: { label: string; history?: boolean; tables: Array<Table<any, any>> },
    fn: (scope: WriteScope) => Promise<R>,
  ): Promise<R> {
    const traces: Trace[] = [];
    const result = await this.db.transaction('rw', [...opts.tables, this.db.syncQueue, this.db.auditEvents], async () => {
      const scope: WriteScope = {
        put: async (table, entityType, op, before, after) => {
          await table.put(after);
          await this.enqueue(entityType, after.id, after.deletedAt ? 'delete' : 'upsert', after.rev);
          await this.audit(entityType, after.id, op, opts.label);
          traces.push({ entityType, id: after.id, op, before, after });
          return after;
        },
        purge: async (table, entityType, before) => {
          await table.delete(before.id);
          await this.enqueue(entityType, before.id, 'delete', before.rev + 1);
          await this.audit(entityType, before.id, 'purge', opts.label);
          traces.push({ entityType, id: before.id, op: 'purge', before, after: undefined });
        },
      };
      return fn(scope);
    });

    if (traces.length) {
      const ids: ChangeEvent['ids'] = {};
      for (const t of traces) (ids[t.entityType] ??= []).push(t.id);
      const op = traces.length === 1 ? traces[0]!.op : 'update';
      this.emit({ entityTypes: Object.keys(ids) as SyncEntityType[], ids, op });
      if (opts.history !== false) this.recordHistory(opts.label, traces);
    }
    return result;
  }

  /** Coalesces multiple repository calls into a single undo step. */
  async batch<R>(label: string, fn: () => Promise<R>): Promise<R> {
    if (this.batchEntry) return fn(); // nested: join the outer batch
    this.batchEntry = { label, traces: [] };
    try {
      return await fn();
    } finally {
      const entry = this.batchEntry;
      this.batchEntry = null;
      if (entry && entry.traces.length) this.pushUndo(entry);
    }
  }

  private recordHistory(label: string, traces: Trace[]): void {
    const undoable = traces.filter((t) => t.op !== 'purge' && t.op !== 'import');
    if (undoable.length === 0) return;
    if (this.batchEntry) {
      this.batchEntry.traces.push(...undoable);
      return;
    }
    this.pushUndo({ label, traces: undoable });
  }

  private pushUndo(entry: HistoryEntry): void {
    this.undoStack.push(entry);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  peekUndoLabel(): string | undefined {
    return this.undoStack[this.undoStack.length - 1]?.label;
  }
  peekRedoLabel(): string | undefined {
    return this.redoStack[this.redoStack.length - 1]?.label;
  }
  clearHistory(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  async undo(): Promise<string | null> {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    await this.applyHistory(`Undo ${entry.label}`, [...entry.traces].reverse(), 'before');
    this.redoStack.push(entry);
    return entry.label;
  }

  async redo(): Promise<string | null> {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    await this.applyHistory(`Redo ${entry.label}`, entry.traces, 'after');
    this.undoStack.push(entry);
    return entry.label;
  }

  /** Restores the `before` or `after` snapshot of each trace (never destroys data: creates are tombstoned). */
  private async applyHistory(label: string, traces: Trace[], target: 'before' | 'after'): Promise<void> {
    const tables = [...new Set(traces.map((t) => this.tableFor(t.entityType)))];
    await this.write({ label, history: false, tables }, async (w) => {
      for (const t of traces) {
        const table = this.tableFor(t.entityType);
        const current = await table.get(t.id);
        const snapshot = t[target];
        const now = nowIso();
        if (snapshot) {
          const next = { ...snapshot, updatedAt: now, rev: (current?.rev ?? snapshot.rev) + 1 } as BaseRecord;
          await w.put(table, t.entityType, 'update', current, next);
        } else if (current && !current.deletedAt) {
          // `before` is undefined for creates: undo = tombstone, not hard delete.
          const next = { ...current, deletedAt: now, updatedAt: now, rev: current.rev + 1 } as BaseRecord;
          await w.put(table, t.entityType, 'delete', current, next);
        }
      }
    });
    this.emit({ entityTypes: [...new Set(traces.map((t) => t.entityType))], ids: {}, op: 'history' });
  }

  /** Call within a transaction. Coalesces to one pending pointer per record. */
  async enqueue(entityType: SyncEntityType, recordId: string, operation: 'upsert' | 'delete', rev: number): Promise<void> {
    const existing = await this.db.syncQueue.where('[entityType+recordId]').equals([entityType, recordId]).toArray();
    if (existing.length) await this.db.syncQueue.bulkDelete(existing.map((e) => e.sequence!));
    await this.db.syncQueue.add({
      opId: newId(),
      entityType,
      recordId,
      operation,
      rev,
      schemaVersion: SCHEMA_VERSION,
      clientTimestamp: nowIso(),
      createdAt: nowIso(),
      attempts: 0,
    });
  }

  private async audit(entityType: string, entityId: string, action: AuditEventRecord['action'], summary?: string): Promise<void> {
    await this.db.auditEvents.add({ id: newId(), entityType, entityId, action, at: nowIso(), summary });
  }

  /**
   * Applies records that arrived from the cloud. They are written verbatim (the server's rev/updatedAt are
   * authoritative), do NOT enter the outbox (no echo loop), and are not undoable. Emits a change event.
   */
  async applyRemote(entityType: SyncEntityType, records: BaseRecord[]): Promise<void> {
    if (records.length === 0) return;
    const table = this.tableFor(entityType);
    await this.db.transaction('rw', [table], async () => {
      await table.bulkPut(records);
    });
    const ids: ChangeEvent['ids'] = { [entityType]: records.map((r) => r.id) };
    this.emit({ entityTypes: [entityType], ids, op: 'import' });
  }

  /** Removes remote tombstone targets that must disappear locally without an outbox entry. */
  async removeRemote(entityType: SyncEntityType, id: string): Promise<void> {
    const table = this.tableFor(entityType);
    await table.delete(id);
    this.emit({ entityTypes: [entityType], ids: { [entityType]: [id] }, op: 'purge' });
  }

  /** Notifies listeners after a bulk operation (import/restore) that bypassed `write`. */
  notifyBulk(entityTypes: SyncEntityType[]): void {
    this.emit({ entityTypes, ids: {}, op: 'import' });
  }

  /** Notifies listeners about a committed change made outside `write` (e.g. settings). */
  notifyChange(entityTypes: SyncEntityType[], op: ChangeOp): void {
    this.emit({ entityTypes, ids: {}, op });
  }
}
