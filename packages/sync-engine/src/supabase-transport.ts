import { UkwError } from '@ukw/domain';
import type { PullPage, PushOp, PushResult, RemoteRecord, SyncTransport } from './types';

export interface SupabaseTransportConfig {
  /** https://<project>.supabase.co */
  url: string;
  /** The project's public anon key. It is designed to be public; access is enforced by row-level security. */
  anonKey: string;
  /** Returns the signed-in user's access token (JWT). Never the service-role key. */
  getAccessToken: () => string | Promise<string>;
  fetch?: typeof fetch;
}

/**
 * Talks to the two SQL functions in cloud/supabase/schema.sql through Supabase's REST RPC endpoint.
 * Row-level security makes every call operate only on the caller's own rows.
 *
 * NOT VERIFIED against a live Supabase project in this build (no credentials/network in the authoring
 * sandbox). The request/response mapping is unit-tested against a fake endpoint.
 */
export class SupabaseTransport implements SyncTransport {
  constructor(private readonly cfg: SupabaseTransportConfig) {}

  private async rpc<T>(fn: string, body: unknown): Promise<T> {
    const f = this.cfg.fetch ?? fetch;
    let res: Response;
    try {
      res = await f(`${this.cfg.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: this.cfg.anonKey, authorization: `Bearer ${await this.cfg.getAccessToken()}` },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new UkwError('OFFLINE', 'Could not reach the sync server.', { cause: err });
    }
    if (res.status === 401 || res.status === 403) throw new UkwError('UNAUTHORIZED', 'Sign in again to keep syncing.');
    if (res.status === 429) throw new UkwError('QUOTA_EXCEEDED', 'The sync server is rate limiting requests. Try again shortly.');
    if (res.status >= 500) throw new UkwError('OFFLINE', `The sync server had a problem (${res.status}).`);
    if (!res.ok) throw new UkwError('INTERNAL_ERROR', `Sync request failed (${res.status}).`);
    return (await res.json()) as T;
  }

  private static toRemote(r: Record<string, any>): RemoteRecord {
    return { entityType: r.entity_type, id: r.id, rev: r.rev, updatedAt: r.updated_at, deleted: !!r.deleted, payload: r.payload ?? null, serverSeq: Number(r.server_seq), deviceId: r.device_id ?? undefined };
  }

  async push(ops: PushOp[]): Promise<PushResult[]> {
    const rows = await this.rpc<Array<Record<string, any>>>('ukw_push', {
      ops: ops.map((o) => ({ op_id: o.opId, entity_type: o.entityType, id: o.id, rev: o.rev, updated_at: o.updatedAt, deleted: o.deleted, payload: o.payload, base_seq: o.baseSeq, device_id: o.deviceId })),
    });
    return rows.map((r): PushResult => (r.status === 'rejected' ? { opId: r.op_id, status: 'rejected', error: String(r.error ?? 'rejected') } : { opId: r.op_id, status: r.status === 'conflict' ? 'conflict' : 'ok', record: SupabaseTransport.toRemote(r.record) }));
  }

  async pull(sinceSeq: number, limit: number): Promise<PullPage> {
    const rows = await this.rpc<Array<Record<string, any>>>('ukw_pull', { since: sinceSeq, lim: limit + 1 });
    const hasMore = rows.length > limit;
    const records = rows.slice(0, limit).map(SupabaseTransport.toRemote);
    return { records, nextSeq: records.length ? records[records.length - 1]!.serverSeq : sinceSeq, hasMore };
  }
}
