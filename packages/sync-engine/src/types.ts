import type { SyncEntityType } from '@ukw/domain';

/** A record as stored by the server (one row per user + entity type + id). */
export interface RemoteRecord {
  entityType: SyncEntityType;
  id: string;
  rev: number;
  updatedAt: string;
  /** Tombstone. `payload` still carries the record (with deletedAt) so other devices can apply it. */
  deleted: boolean;
  /** Full record JSON, or null after a permanent purge. */
  payload: Record<string, unknown> | null;
  /** Monotonic, assigned by the server on every accepted write. Drives pulling and conflict detection. */
  serverSeq: number;
  deviceId?: string;
}

export interface PushOp {
  /** Idempotency key: replaying an op never changes server state twice. */
  opId: string;
  entityType: SyncEntityType;
  id: string;
  rev: number;
  updatedAt: string;
  deleted: boolean;
  payload: Record<string, unknown> | null;
  /** serverSeq of this record when the device last saw it (0 = never seen). Optimistic concurrency token. */
  baseSeq: number;
  deviceId: string;
}

export type PushResult =
  | { opId: string; status: 'ok'; record: RemoteRecord }
  | { opId: string; status: 'conflict'; record: RemoteRecord }
  | { opId: string; status: 'rejected'; error: string };

export interface PullPage {
  records: RemoteRecord[];
  nextSeq: number;
  hasMore: boolean;
}

/** The only thing the engine knows about the cloud. Implementations must be idempotent per opId. */
export interface SyncTransport {
  push(ops: PushOp[]): Promise<PushResult[]>;
  pull(sinceSeq: number, limit: number): Promise<PullPage>;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncReport {
  pushed: number;
  pulled: number;
  conflicts: { serverWon: number; localWon: number; noteCopies: number };
  /** Remote records written by a newer app version that this version cannot read yet. */
  skippedNewerSchema: number;
  errors: string[];
  at: string;
  status: SyncStatus;
}
