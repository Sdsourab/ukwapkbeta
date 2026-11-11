import type { SyncEntityType } from '@ukw/domain';
import type { PullPage, PushOp, PushResult, RemoteRecord, SyncTransport } from './types';

/**
 * In-memory reference server. Defines the exact semantics a real backend (see cloud/supabase/schema.sql)
 * must implement: optimistic concurrency on serverSeq, idempotent ops, monotonic sequence.
 * Also used to simulate flaky networks in tests.
 */
export class MemoryTransport implements SyncTransport {
  private records = new Map<string, RemoteRecord>();
  private ops = new Map<string, PushResult>();
  private seq = 0;
  /** Set to make the next N calls fail like a dropped connection. */
  failNext = 0;
  calls = { push: 0, pull: 0 };

  private key = (t: SyncEntityType, id: string) => `${t}:${id}`;

  private maybeFail() {
    if (this.failNext > 0) {
      this.failNext--;
      throw Object.assign(new Error('Network request failed'), { code: 'OFFLINE' });
    }
  }

  async push(ops: PushOp[]): Promise<PushResult[]> {
    this.calls.push++;
    this.maybeFail();
    const out: PushResult[] = [];
    for (const op of ops) {
      const seen = this.ops.get(op.opId);
      if (seen) { out.push(seen); continue; }
      const k = this.key(op.entityType, op.id);
      const existing = this.records.get(k);
      let result: PushResult;
      if (existing && existing.serverSeq !== op.baseSeq) {
        result = { opId: op.opId, status: 'conflict', record: structuredClone(existing) };
      } else {
        const record: RemoteRecord = { entityType: op.entityType, id: op.id, rev: op.rev, updatedAt: op.updatedAt, deleted: op.deleted, payload: op.payload ? structuredClone(op.payload) : null, serverSeq: ++this.seq, deviceId: op.deviceId };
        this.records.set(k, record);
        result = { opId: op.opId, status: 'ok', record: structuredClone(record) };
      }
      this.ops.set(op.opId, result);
      out.push(result);
    }
    return out;
  }

  async pull(sinceSeq: number, limit: number): Promise<PullPage> {
    this.calls.pull++;
    this.maybeFail();
    const all = [...this.records.values()].filter((r) => r.serverSeq > sinceSeq).sort((a, b) => a.serverSeq - b.serverSeq);
    const page = all.slice(0, limit);
    return { records: structuredClone(page), nextSeq: page.length ? page[page.length - 1]!.serverSeq : sinceSeq, hasMore: all.length > page.length };
  }

  /** Test helpers */
  snapshot(): RemoteRecord[] { return structuredClone([...this.records.values()]); }
  get(type: SyncEntityType, id: string): RemoteRecord | undefined { return this.records.get(this.key(type, id)); }
  get lastSeq() { return this.seq; }
}
