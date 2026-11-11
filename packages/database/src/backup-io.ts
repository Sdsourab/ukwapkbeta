import {
  BACKUP_FORMAT,
  BACKUP_TABLES,
  SCHEMA_VERSION,
  UkwError,
  newId,
  nowIso,
  validateBackup,
  type BackupFile,
  type BackupTable,
  type SyncEntityType,
} from '@ukw/domain';
import type { StoreContext } from './context';

export const APP_VERSION = '0.1.0';

export interface ExportOptions {
  /** Include soft-deleted records (Trash). Default true so a restore is lossless. */
  includeDeleted?: boolean;
}

export async function exportBackup(ctx: StoreContext, opts: ExportOptions = {}): Promise<BackupFile> {
  const includeDeleted = opts.includeDeleted ?? true;
  const { db } = ctx;
  const tables: BackupFile['tables'] = {};
  for (const name of BACKUP_TABLES) {
    const rows = (await (db[name] as unknown as { toArray(): Promise<Array<Record<string, unknown>>> }).toArray()) as Array<Record<string, unknown>>;
    tables[name] = includeDeleted || name === 'settings' ? rows : rows.filter((r) => !r.deletedAt);
  }
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, appVersion: APP_VERSION, exportedAt: nowIso(), tables };
}

export type ImportMode = 'merge' | 'replace';

export interface ImportSummary {
  mode: ImportMode;
  added: number;
  updated: number;
  skipped: number;
  byTable: Partial<Record<BackupTable, { added: number; updated: number; skipped: number }>>;
  unknownTables: string[];
  warnings: string[];
  /** For `replace`: a full backup of the data that was replaced, so the caller can offer it for download. */
  safetyBackup?: BackupFile;
}

const ENTITY_TABLES = BACKUP_TABLES.filter((t) => t !== 'settings');

/**
 * Validates then imports a backup atomically (one transaction: all-or-nothing).
 * - merge: keeps whichever copy of a record has the newer `updatedAt`; never deletes anything.
 * - replace: clears local data first, after taking a safety backup.
 */
export async function importBackup(ctx: StoreContext, raw: unknown, opts: { mode?: ImportMode } = {}): Promise<ImportSummary> {
  const mode = opts.mode ?? 'merge';
  const validation = validateBackup(raw);
  if (!validation.ok) {
    throw new UkwError('VALIDATION_ERROR', `Backup rejected: ${validation.issues[0]?.message ?? 'invalid file'}`, { details: validation.issues, recoverable: true });
  }
  const { backup, unknownTables } = validation;
  const { db } = ctx;

  const summary: ImportSummary = { mode, added: 0, updated: 0, skipped: 0, byTable: {}, unknownTables, warnings: [] };
  if (mode === 'replace') summary.safetyBackup = await exportBackup(ctx);
  const bump = (t: BackupTable, k: 'added' | 'updated' | 'skipped') => {
    const e = (summary.byTable[t] ??= { added: 0, updated: 0, skipped: 0 });
    e[k]++;
    summary[k]++;
  };

  const touched = new Set<SyncEntityType>();
  const allTables = BACKUP_TABLES.map((t) => db[t] as unknown as import('dexie').Table<any, any>);

  await db.transaction('rw', [...allTables, db.syncQueue, db.auditEvents], async () => {
    if (mode === 'replace') {
      for (const t of allTables) await t.clear();
      await db.syncQueue.clear();
    }

    const tagIdMap = new Map<string, string>();
    const order: BackupTable[] = ['tags', ...BACKUP_TABLES.filter((t) => t !== 'tags')];

    for (const name of order) {
      const rows = backup.tables[name];
      if (!rows?.length) continue;
      const table = db[name] as unknown as import('dexie').Table<any, any>;

      for (const row of rows) {
        if (name === 'settings') {
          const existing = await db.settings.get(row.key as string);
          if (existing && existing.updatedAt >= (row.updatedAt as string)) { bump(name, 'skipped'); continue; }
          await db.settings.put(row as never);
          await ctx.enqueue('settings', row.key as string, 'upsert', 0);
          touched.add('settings');
          bump(name, existing ? 'updated' : 'added');
          continue;
        }

        let rec: Record<string, any> = { ...row, rev: typeof row.rev === 'number' ? row.rev : 1 };

        if (name === 'tags') {
          const clash = await db.tags.where('nameKey').equals(rec.nameKey).first();
          if (clash && clash.id !== rec.id) {
            tagIdMap.set(rec.id, clash.id);
            bump(name, 'skipped');
            continue;
          }
        }
        if (name === 'taggings' && tagIdMap.has(rec.tagId)) rec = { ...rec, tagId: tagIdMap.get(rec.tagId) };
        if (name === 'readingProgress') {
          const clash = await db.readingProgress.where('documentId').equals(rec.documentId).first();
          if (clash && clash.id !== rec.id) {
            if (clash.updatedAt >= rec.updatedAt) { bump(name, 'skipped'); continue; }
            await db.readingProgress.delete(clash.id);
          }
        }

        const existing = await table.get(rec.id);
        if (existing && existing.updatedAt >= rec.updatedAt) { bump(name, 'skipped'); continue; }
        if (existing) rec.rev = Math.max(existing.rev ?? 0, rec.rev) + 1;
        await table.put(rec);
        await ctx.enqueue(name as SyncEntityType, rec.id, rec.deletedAt ? 'delete' : 'upsert', rec.rev);
        touched.add(name as SyncEntityType);
        bump(name, existing ? 'updated' : 'added');
      }
    }
    await db.auditEvents.add({ id: newId(), entityType: 'backup', entityId: 'backup', action: 'import', at: nowIso(), summary: `${mode}: +${summary.added} ~${summary.updated} =${summary.skipped}` });
  });

  summary.warnings = await referentialWarnings(ctx);
  ctx.notifyBulk([...touched, ...(mode === 'replace' ? (ENTITY_TABLES as unknown as SyncEntityType[]) : [])]);
  ctx.clearHistory();
  return summary;
}

/** Reports (never silently repairs) dangling references so the user can decide what to do. */
export async function referentialWarnings(ctx: StoreContext): Promise<string[]> {
  const { db } = ctx;
  const live = <T extends { deletedAt?: string | null }>(r: T) => !r.deletedAt;
  const [docs, anns, notes, tags, cols, nodes, graphs] = await Promise.all([
    db.documents.filter(live).toArray(), db.annotations.filter(live).toArray(), db.notes.filter(live).toArray(),
    db.tags.filter(live).toArray(), db.collections.filter(live).toArray(), db.nodes.filter(live).toArray(), db.graphs.filter(live).toArray(),
  ]);
  const docIds = new Set(docs.map((d) => d.id));
  const annIds = new Set(anns.map((a) => a.id));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const graphIds = new Set(graphs.map((g) => g.id));
  const tagIds = new Set(tags.map((t) => t.id));
  const colIds = new Set(cols.map((c) => c.id));
  const warnings: string[] = [];
  const count = (n: number, msg: string) => n > 0 && warnings.push(`${n} ${msg}`);
  count(anns.filter((a) => !docIds.has(a.documentId)).length, 'annotation(s) belong to a document that is missing.');
  count(notes.filter((n) => n.annotationId && !annIds.has(n.annotationId)).length, 'note(s) are attached to an annotation that is missing.');
  count(nodes.filter((n) => !graphIds.has(n.graphId)).length, 'graph node(s) belong to a graph that is missing.');
  count((await db.edges.filter(live).toArray()).filter((e) => !nodeIds.has(e.sourceNodeId) || !nodeIds.has(e.targetNodeId)).length, 'graph edge(s) point to a node that is missing.');
  count((await db.taggings.filter(live).toArray()).filter((t) => !tagIds.has(t.tagId)).length, 'tag link(s) point to a tag that is missing.');
  count((await db.collectionItems.filter(live).toArray()).filter((i) => !colIds.has(i.collectionId)).length, 'collection item(s) belong to a collection that is missing.');
  return warnings;
}
