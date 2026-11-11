import { z } from 'zod';
import { SCHEMA_VERSION } from './types';

/**
 * Versioned backup / export format (docs/05 §5.8). Import validation is strict about the
 * shape of required fields but preserves unknown fields ("never silently discard unknown fields").
 */

export const BACKUP_FORMAT = 'ukw-backup' as const;

export const BACKUP_TABLES = [
  'documents',
  'annotations',
  'notes',
  'tags',
  'taggings',
  'collections',
  'collectionItems',
  'graphs',
  'nodes',
  'edges',
  'researchProjects',
  'references',
  'matrices',
  'tasks',
  'readingProgress',
  'settings',
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  deviceId?: string;
  tables: Partial<Record<BackupTable, Array<Record<string, unknown>>>>;
}

export const IMPORT_LIMITS = {
  maxRecordsPerTable: 200_000,
  maxStringLength: 2_000_000,
  maxFileBytes: 200 * 1024 * 1024,
} as const;

const iso = z.string().refine((s) => s.length >= 10 && !Number.isNaN(Date.parse(s)), 'invalid ISO date');
const base = {
  id: z.string().min(1).max(200),
  createdAt: iso,
  updatedAt: iso,
  schemaVersion: z.number().int().min(1),
  rev: z.number().int().min(0).optional(),
  deletedAt: iso.nullish(),
};
const rec = <T extends z.ZodRawShape>(shape: T) => z.looseObject({ ...base, ...shape });

const anchor = z.looseObject({ exact: z.string() });

export const TABLE_SCHEMAS: Record<BackupTable, z.ZodType> = {
  documents: rec({
    canonicalUrl: z.string(),
    normalizedUrl: z.string(),
    sourceType: z.enum(['web', 'conversation', 'pdf', 'manual']),
  }),
  annotations: rec({
    documentId: z.string().min(1),
    type: z.enum(['highlight', 'underline', 'strike', 'bookmark', 'sticky']),
    status: z.enum(['active', 'orphaned', 'archived']),
    anchor: anchor.nullable(),
  }),
  notes: rec({ body: z.string(), format: z.enum(['plain', 'markdown']) }),
  tags: rec({ name: z.string().min(1), nameKey: z.string().min(1) }),
  taggings: rec({ tagId: z.string().min(1), entityType: z.string().min(1), entityId: z.string().min(1) }),
  collections: rec({ name: z.string(), kind: z.enum(['collection', 'folder']) }),
  collectionItems: rec({ collectionId: z.string().min(1), entityType: z.string().min(1), entityId: z.string().min(1) }),
  graphs: rec({ title: z.string(), kind: z.string().min(1) }),
  nodes: rec({
    graphId: z.string().min(1),
    type: z.string().min(1),
    label: z.string(),
    position: z.looseObject({ x: z.number(), y: z.number() }),
  }),
  edges: rec({
    graphId: z.string().min(1),
    sourceNodeId: z.string().min(1),
    targetNodeId: z.string().min(1),
    directed: z.boolean(),
  }),
  researchProjects: rec({ title: z.string() }),
  references: rec({ title: z.string() }),
  matrices: rec({ title: z.string(), kind: z.enum(['evidence', 'literature']), columns: z.array(z.looseObject({ id: z.string() })), rows: z.array(z.looseObject({ id: z.string() })) }),
  tasks: rec({ title: z.string(), status: z.enum(['todo', 'doing', 'done', 'blocked']) }),
  readingProgress: rec({ documentId: z.string().min(1) }),
  settings: z.looseObject({ key: z.string().min(1).max(80), value: z.unknown(), updatedAt: iso }),
};

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/** Rejects prototype-pollution style keys anywhere in the payload. Returns the offending path or null. */
export function findForbiddenKey(value: unknown, path = '$', depth = 0): string | null {
  if (depth > 40) return `${path} (too deep)`;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findForbiddenKey(value[i], `${path}[${i}]`, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      if (FORBIDDEN_KEYS.has(key)) return `${path}.${key}`;
      const hit = findForbiddenKey((value as Record<string, unknown>)[key], `${path}.${key}`, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

function longestString(value: unknown, depth = 0): number {
  if (depth > 40) return 0;
  if (typeof value === 'string') return value.length;
  if (Array.isArray(value)) return value.reduce<number>((m, v) => Math.max(m, longestString(v, depth + 1)), 0);
  if (value && typeof value === 'object')
    return Object.values(value).reduce<number>((m, v) => Math.max(m, longestString(v, depth + 1)), 0);
  return 0;
}

export interface BackupIssue {
  table?: string;
  index?: number;
  message: string;
}

export type BackupValidation =
  | { ok: true; backup: BackupFile; counts: Partial<Record<BackupTable, number>>; unknownTables: string[] }
  | { ok: false; issues: BackupIssue[] };

/** Brings an older backup up to the current schema. Currently the only version is 1. */
export function migrateBackup(raw: Record<string, unknown>): Record<string, unknown> {
  return raw; // schemaVersion 1 → 1: identity. Add stepwise migrations here when SCHEMA_VERSION increases.
}

export function validateBackup(raw: unknown): BackupValidation {
  const issues: BackupIssue[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, issues: [{ message: 'Backup must be a JSON object.' }] };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) return { ok: false, issues: [{ message: `Not a UKW backup (format must be "${BACKUP_FORMAT}").` }] };
  if (typeof obj.schemaVersion !== 'number' || !Number.isInteger(obj.schemaVersion) || obj.schemaVersion < 1) {
    return { ok: false, issues: [{ message: 'Backup is missing a valid schemaVersion.' }] };
  }
  if (obj.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      issues: [{ message: `Backup was created by a newer version (schema ${obj.schemaVersion}, this app supports ${SCHEMA_VERSION}). Update the app first.` }],
    };
  }
  const forbidden = findForbiddenKey(obj);
  if (forbidden) return { ok: false, issues: [{ message: `Backup contains a forbidden key at ${forbidden}.` }] };
  if (typeof obj.tables !== 'object' || obj.tables === null || Array.isArray(obj.tables)) {
    return { ok: false, issues: [{ message: 'Backup has no "tables" object.' }] };
  }

  const migrated = migrateBackup(obj);
  const tables = migrated.tables as Record<string, unknown>;
  const counts: Partial<Record<BackupTable, number>> = {};
  const unknownTables: string[] = [];

  for (const [name, rows] of Object.entries(tables)) {
    if (!(BACKUP_TABLES as readonly string[]).includes(name)) {
      unknownTables.push(name);
      continue;
    }
    const table = name as BackupTable;
    if (!Array.isArray(rows)) {
      issues.push({ table, message: 'Table must be an array.' });
      continue;
    }
    if (rows.length > IMPORT_LIMITS.maxRecordsPerTable) {
      issues.push({ table, message: `Too many records (${rows.length} > ${IMPORT_LIMITS.maxRecordsPerTable}).` });
      continue;
    }
    const schema = TABLE_SCHEMAS[table];
    const seen = new Set<string>();
    rows.forEach((row, index) => {
      const parsed = schema.safeParse(row);
      if (!parsed.success) {
        const first = parsed.error.issues[0];
        issues.push({ table, index, message: `${first?.path.join('.') || 'record'}: ${first?.message ?? 'invalid'}` });
        return;
      }
      if (longestString(row) > IMPORT_LIMITS.maxStringLength) {
        issues.push({ table, index, message: 'A text field exceeds the maximum size.' });
        return;
      }
      const key = table === 'settings' ? String((row as { key: string }).key) : String((row as { id: string }).id);
      if (seen.has(key)) issues.push({ table, index, message: `Duplicate id "${key}".` });
      seen.add(key);
    });
    counts[table] = rows.length;
  }

  if (issues.length) return { ok: false, issues: issues.slice(0, 50) };
  return { ok: true, backup: migrated as unknown as BackupFile, counts, unknownTables };
}
