import { SCHEMA_VERSION, UkwError, newId, nowIso, type BaseRecord, type SyncEntityType } from '@ukw/domain';
import type { DataStore } from '@ukw/database';
import type { PushOp, PushResult, RemoteRecord, SyncReport, SyncStatus, SyncTransport } from './types';

const SYNCED: readonly SyncEntityType[] = ['documents', 'annotations', 'notes', 'tags', 'taggings', 'collections', 'collectionItems', 'graphs', 'nodes', 'edges', 'researchProjects', 'references', 'matrices', 'tasks', 'readingProgress'];

export interface EngineOptions {
  batchSize?: number;
  pullPageSize?: number;
  /** Max push/pull rounds per sync() so a hot, busy account cannot loop forever. */
  maxRounds?: number;
}

/**
 * Local-first synchronisation (docs/07 §7.8, docs/05 §5.5).
 *  - Push: coalesced outbox pointers → current records → transport (idempotent per opId).
 *  - Pull: everything after our cursor; applied verbatim, never re-queued (no echo loop).
 *  - Conflicts (a record changed on both sides): last writer wins by updatedAt (then rev, then device id);
 *    for note bodies the losing text is kept as a "conflict copy" note, so typed text is never silently lost.
 * The engine never touches the network itself: it only talks to a SyncTransport.
 */
export class SyncEngine {
  private running: Promise<SyncReport> | null = null;
  /** Queue sequences that already failed during the current run (not retried until the next run). */
  private stuck = new Set<number>();
  private skippedIds = new Set<string>();
  private listeners = new Set<(s: SyncStatus, r?: SyncReport) => void>();
  private _status: SyncStatus = 'idle';
  private autoTimer: ReturnType<typeof setInterval> | undefined;
  private debounce: ReturnType<typeof setTimeout> | undefined;
  private unsubscribe: (() => void) | undefined;
  private cleanup: Array<() => void> = [];
  private readonly o: Required<EngineOptions>;

  constructor(private readonly store: DataStore, private readonly transport: SyncTransport, opts: EngineOptions = {}) {
    this.o = { batchSize: opts.batchSize ?? 50, pullPageSize: opts.pullPageSize ?? 200, maxRounds: opts.maxRounds ?? 6 };
  }

  get status(): SyncStatus { return this._status; }

  subscribe(l: (s: SyncStatus, r?: SyncReport) => void): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  private setStatus(s: SyncStatus, r?: SyncReport) {
    this._status = s;
    for (const l of [...this.listeners]) l(s, r);
  }

  /* ------------------------------------------------------------- metadata */

  private async meta<T>(key: string, fallback: T): Promise<T> {
    const row = await this.store.db.syncMeta.get(key);
    return (row ? row.value : fallback) as T;
  }
  private async setMeta(key: string, value: unknown) { await this.store.db.syncMeta.put({ key, value }); }

  async deviceId(): Promise<string> {
    let id = await this.meta<string | null>('deviceId', null);
    if (!id) { id = newId(); await this.setMeta('deviceId', id); }
    return id;
  }
  async lastSyncAt(): Promise<string | null> { return this.meta<string | null>('lastSyncAt', null); }

  private seqKey = (t: SyncEntityType, id: string) => `seq:${t}:${id}`;

  /* ------------------------------------------------------------- public API */

  /** Runs one full sync (push, pull, repeat until quiet). Concurrent calls share the same run. */
  sync(): Promise<SyncReport> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => { this.running = null; });
    return this.running;
  }

  /** Syncs now and then on local changes (debounced), on regained connectivity, and periodically. */
  startAuto(intervalMs = 60_000): void {
    this.stopAuto();
    this.unsubscribe = this.store.subscribe((e) => {
      if (e.remote || e.op === 'import' && e.entityTypes.length === 0) return;
      clearTimeout(this.debounce);
      this.debounce = setTimeout(() => void this.sync(), 2000);
    });
    this.autoTimer = setInterval(() => void this.sync(), intervalMs);
    if (typeof addEventListener === 'function') {
      const online = () => void this.sync();
      addEventListener('online', online);
      this.cleanup.push(() => removeEventListener('online', online));
    }
    void this.sync();
  }

  stopAuto(): void {
    clearTimeout(this.debounce);
    clearInterval(this.autoTimer);
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
  }

  /* ------------------------------------------------------------- the run */

  private async run(): Promise<SyncReport> {
    const report: SyncReport = { pushed: 0, pulled: 0, conflicts: { serverWon: 0, localWon: 0, noteCopies: 0 }, skippedNewerSchema: 0, errors: [], at: nowIso(), status: 'syncing' };
    this.setStatus('syncing');
    this.stuck = new Set();
    this.skippedIds = new Set();
    try {
      for (let round = 0; round < this.o.maxRounds; round++) {
        const pushed = await this.pushAll(report);
        const pulled = await this.pullAll(report);
        if (pushed === 0 && pulled === 0 && (await this.store.pendingSyncCount()) === 0) break;
        if (pushed === 0 && pulled === 0) break; // nothing moved: remaining items are failing, do not spin
      }
      report.status = report.errors.length ? 'error' : 'idle';
      if (!report.errors.length) await this.setMeta('lastSyncAt', report.at);
    } catch (err) {
      const offline = (err as { code?: string })?.code === 'OFFLINE' || err instanceof TypeError || (err instanceof UkwError && err.code === 'OFFLINE');
      report.errors.push(err instanceof Error ? err.message : String(err));
      report.status = offline ? 'offline' : 'error';
    }
    this.setStatus(report.status, report);
    return report;
  }

  /* ------------------------------------------------------------- push */

  private async pushAll(report: SyncReport): Promise<number> {
    const { db } = this.store;
    const device = await this.deviceId();
    let total = 0;
    for (;;) {
      const items = await db.syncQueue.orderBy('sequence').filter((i) => !this.stuck.has(i.sequence!)).limit(this.o.batchSize).toArray();
      if (items.length === 0) return total;

      const ops: Array<{ item: (typeof items)[number]; op: PushOp; local: BaseRecord | undefined }> = [];
      for (const item of items) {
        if (!SYNCED.includes(item.entityType)) { await db.syncQueue.delete(item.sequence!); continue; } // settings stay on the device
        const local = (await this.store.ctx.tableFor(item.entityType).get(item.recordId)) as BaseRecord | undefined;
        if (!local && item.operation === 'upsert') { await db.syncQueue.delete(item.sequence!); continue; } // vanished: nothing to send
        const baseSeq = await this.meta<number>(this.seqKey(item.entityType, item.recordId), 0);
        ops.push({
          item, local,
          op: { opId: item.opId, entityType: item.entityType, id: item.recordId, rev: local?.rev ?? item.rev, updatedAt: local?.updatedAt ?? item.clientTimestamp, deleted: local ? !!local.deletedAt : true, payload: local ? (structuredClone(local) as unknown as Record<string, unknown>) : null, baseSeq, deviceId: device },
        });
      }
      if (ops.length === 0) continue;

      let results: PushResult[];
      try {
        results = await this.transport.push(ops.map((x) => x.op));
      } catch (err) {
        for (const { item } of ops) await db.syncQueue.update(item.sequence!, { attempts: item.attempts + 1, lastError: err instanceof Error ? err.message : String(err) });
        throw err; // the run reports offline/error and stops; the queue is intact
      }

      let progressed = 0;
      for (const { item, op, local } of ops) {
        const res = results.find((r) => r.opId === op.opId);
        if (!res) { this.stuck.add(item.sequence!); await db.syncQueue.update(item.sequence!, { attempts: item.attempts + 1, lastError: 'No response for operation' }); continue; }
        if (res.status === 'ok') {
          await this.setMeta(this.seqKey(op.entityType, op.id), res.record.serverSeq);
          await this.dequeueIfUnchanged(item.sequence!, item.opId); // a newer local edit re-queued under a new opId stays queued
          report.pushed++; progressed++; total++;
        } else if (res.status === 'conflict') {
          const requeue = await this.resolveConflict(op.entityType, local, res.record, report);
          if (!requeue) await this.dequeueIfUnchanged(item.sequence!, item.opId);
          progressed++;
        } else {
          report.errors.push(`${op.entityType} ${op.id}: ${res.error}`);
          this.stuck.add(item.sequence!);
          await db.syncQueue.update(item.sequence!, { attempts: item.attempts + 1, lastError: res.error });
        }
      }
      if (progressed === 0) return total; // everything in this batch is stuck; leave it for the next sync
    }
  }

  private async dequeueIfUnchanged(sequence: number, opId: string): Promise<void> {
    const cur = await this.store.db.syncQueue.get(sequence);
    if (cur && cur.opId === opId) await this.store.db.syncQueue.delete(sequence);
  }

  /* ------------------------------------------------------------- pull */

  private async pullAll(report: SyncReport): Promise<number> {
    let cursor = await this.meta<number>('cursor', 0);
    let applied = 0;
    for (;;) {
      const page = await this.transport.pull(cursor, this.o.pullPageSize);
      let blockedAt: number | null = null;
      for (const rec of page.records) {
        if ((rec.payload as { schemaVersion?: number } | null)?.schemaVersion !== undefined && (rec.payload as { schemaVersion: number }).schemaVersion > SCHEMA_VERSION) {
          this.skippedIds.add(`${rec.entityType}:${rec.id}`);
          report.skippedNewerSchema = this.skippedIds.size;
          blockedAt = blockedAt === null ? rec.serverSeq : Math.min(blockedAt, rec.serverSeq);
          continue;
        }
        if (await this.applyPulled(rec, report)) { applied++; report.pulled++; }
      }
      // Never advance past a record we could not read: it is fetched again after the app is upgraded.
      cursor = blockedAt !== null ? Math.min(page.nextSeq, blockedAt - 1) : page.nextSeq;
      await this.setMeta('cursor', cursor);
      if (!page.hasMore || blockedAt !== null) return applied;
    }
  }

  private async hasPending(t: SyncEntityType, id: string): Promise<boolean> {
    return (await this.store.db.syncQueue.where('[entityType+recordId]').equals([t, id]).count()) > 0;
  }

  private async applyPulled(rec: RemoteRecord, report: SyncReport): Promise<boolean> {
    if (!SYNCED.includes(rec.entityType)) return false;
    const table = this.store.ctx.tableFor(rec.entityType);
    const local = (await table.get(rec.id)) as BaseRecord | undefined;
    const known = await this.meta<number>(this.seqKey(rec.entityType, rec.id), 0);
    if (known >= rec.serverSeq) return false; // already have this version (e.g. our own push echoed back)

    if (local && (await this.hasPending(rec.entityType, rec.id))) {
      // A local edit that has not been pushed yet meets a newer server version.
      const requeue = await this.resolveConflict(rec.entityType, local, rec, report);
      if (!requeue) await this.store.db.syncQueue.where('[entityType+recordId]').equals([rec.entityType, rec.id]).delete(); // server version applied: nothing left to send
      return true;
    }
    await this.applyRemoteRecord(rec);
    await this.setMeta(this.seqKey(rec.entityType, rec.id), rec.serverSeq);
    return true;
  }

  /* ------------------------------------------------------------- applying and conflicts */

  private async applyRemoteRecord(rec: RemoteRecord): Promise<void> {
    if (!rec.payload) { await this.store.ctx.removeRemote(rec.entityType, rec.id); return; }
    const payload = { ...(rec.payload as unknown as BaseRecord) };
    if (rec.deleted && !payload.deletedAt) payload.deletedAt = rec.updatedAt;
    await this.clearUniqueClash(rec.entityType, payload);
    await this.store.ctx.applyRemote(rec.entityType, [payload]);
  }

  /** Legacy rows created before deterministic ids can collide on unique indexes. Resolve without losing links. */
  private async clearUniqueClash(t: SyncEntityType, rec: BaseRecord): Promise<void> {
    const { db, ctx } = this.store;
    if (t === 'tags') {
      const key = (rec as unknown as { nameKey: string }).nameKey;
      const clash = await db.tags.where('nameKey').equals(key).first();
      if (clash && clash.id !== rec.id) {
        const links = await db.taggings.where('tagId').equals(clash.id).toArray();
        await ctx.write({ label: 'Merge tags', history: false, tables: [db.tags, db.taggings] }, async (w) => {
          const now = nowIso();
          for (const l of links) {
            const moved = { ...l, id: `tg:${rec.id}:${l.entityType}:${l.entityId}`, tagId: rec.id, updatedAt: now, rev: 1 };
            await w.put(db.taggings, 'taggings', 'create', undefined, moved);
            await w.put(db.taggings, 'taggings', 'delete', l, { ...l, deletedAt: now, updatedAt: now, rev: l.rev + 1 });
          }
          await w.put(db.tags, 'tags', 'delete', clash, { ...clash, nameKey: `${clash.nameKey}~merged~${clash.id}`, deletedAt: now, updatedAt: now, rev: clash.rev + 1 });
        });
      }
    } else if (t === 'readingProgress') {
      const docId = (rec as unknown as { documentId: string }).documentId;
      const clash = await db.readingProgress.where('documentId').equals(docId).first();
      if (clash && clash.id !== rec.id) await db.readingProgress.delete(clash.id);
    }
  }

  private newerWins(local: BaseRecord, remote: RemoteRecord, device: string): boolean {
    if (local.updatedAt !== remote.updatedAt) return local.updatedAt > remote.updatedAt;
    if (local.rev !== remote.rev) return local.rev > remote.rev;
    return device > (remote.deviceId ?? '');
  }

  /**
   * Resolves a record changed on both sides. Returns true when the local version must be pushed again
   * (it won), false when the queue item can be dropped (the server's version was applied).
   */
  private async resolveConflict(t: SyncEntityType, local: BaseRecord | undefined, remote: RemoteRecord, report: SyncReport): Promise<boolean> {
    const { ctx, db } = this.store;
    const device = await this.deviceId();
    const seqKey = this.seqKey(t, remote.id);

    if (!local || !remote.payload) {
      await this.applyRemoteRecord(remote);
      await this.setMeta(seqKey, remote.serverSeq);
      report.conflicts.serverWon++;
      return false;
    }

    const remoteRec = remote.payload as unknown as BaseRecord & { body?: string; title?: string; annotationId?: string; documentId?: string };
    const localNote = local as BaseRecord & { body?: string; title?: string; annotationId?: string; documentId?: string; projectId?: string | null };

    // Notes: never drop typed text. Keep the server's version in place and the local text as a conflict copy.
    if (t === 'notes' && !remote.deleted && !local.deletedAt && localNote.body !== remoteRec.body) {
      await this.applyRemoteRecord(remote);
      await this.setMeta(seqKey, remote.serverSeq);
      const copyId = `${local.id}:conflict:${device.slice(0, 8)}:${local.rev}`;
      if (!(await db.notes.get(copyId))) {
        const now = nowIso();
        await ctx.write({ label: 'Conflict copy', history: false, tables: [db.notes] }, (w) =>
          w.put(db.notes, 'notes', 'create', undefined, {
            ...(localNote as unknown as Record<string, unknown>),
            id: copyId, title: `${localNote.title ?? 'Note'} (conflict copy)`, conflictOf: local.id, pinned: false, createdAt: now, updatedAt: now, rev: 1, deletedAt: null, schemaVersion: SCHEMA_VERSION,
          } as never),
        );
      }
      report.conflicts.noteCopies++;
      return false;
    }

    if (this.newerWins(local, remote, device)) {
      await this.setMeta(seqKey, remote.serverSeq); // we have now seen the server's version; re-push on top of it
      // The retry has a different baseSeq, so it is a new operation: a repeated opId would just replay the cached conflict.
      for (const q of await db.syncQueue.where('[entityType+recordId]').equals([t, remote.id]).toArray()) await db.syncQueue.update(q.sequence!, { opId: newId() });
      report.conflicts.localWon++;
      return true;
    }
    await this.applyRemoteRecord(remote);
    await this.setMeta(seqKey, remote.serverSeq);
    report.conflicts.serverWon++;
    return false;
  }
}
