import Dexie, { type Table } from 'dexie';
import type {
  AnnotationRecord,
  AuditEventRecord,
  BlobRecord,
  CollectionItemRecord,
  CollectionRecord,
  DeviceRecord,
  DocumentRecord,
  GraphEdgeRecord,
  GraphNodeRecord,
  GraphRecord,
  MatrixRecord,
  NoteRecord,
  ReadingProgressRecord,
  ReferenceRecord,
  ResearchProjectRecord,
  SettingRecord,
  SyncQueueItem,
  TagRecord,
  TaggingRecord,
  TaskRecord,
} from '@ukw/domain';

/**
 * Dexie database. Note: booleans are not valid IndexedDB keys, so flags such as `pinned`
 * or `isFavorite` are NOT indexed (docs/05 §5.4 suggested indexing `pinned`; see ADR-009).
 */
export class UkwDatabase extends Dexie {
  documents!: Table<DocumentRecord, string>;
  annotations!: Table<AnnotationRecord, string>;
  notes!: Table<NoteRecord, string>;
  tags!: Table<TagRecord, string>;
  taggings!: Table<TaggingRecord, string>;
  collections!: Table<CollectionRecord, string>;
  collectionItems!: Table<CollectionItemRecord, string>;
  graphs!: Table<GraphRecord, string>;
  nodes!: Table<GraphNodeRecord, string>;
  edges!: Table<GraphEdgeRecord, string>;
  researchProjects!: Table<ResearchProjectRecord, string>;
  references!: Table<ReferenceRecord, string>;
  matrices!: Table<MatrixRecord, string>;
  tasks!: Table<TaskRecord, string>;
  readingProgress!: Table<ReadingProgressRecord, string>;
  syncQueue!: Table<SyncQueueItem, number>;
  settings!: Table<SettingRecord, string>;
  devices!: Table<DeviceRecord, string>;
  auditEvents!: Table<AuditEventRecord, string>;
  blobs!: Table<BlobRecord, string>;
  /** Sync bookkeeping (device id, pull cursor, last-known server revision per record). Never exported or synced. */
  syncMeta!: Table<{ key: string; value: unknown }, string>;

  constructor(name = 'ukw') {
    super(name);
    this.version(1).stores({
      documents: 'id, normalizedUrl, sourceType, platform, externalId, updatedAt, projectId',
      annotations: 'id, documentId, type, status, updatedAt',
      notes: 'id, documentId, annotationId, updatedAt',
      tags: 'id, &nameKey',
      taggings: 'id, tagId, entityId, [entityType+entityId]',
      collections: 'id, parentId, kind, sortOrder',
      collectionItems: 'id, collectionId, [entityType+entityId]',
      graphs: 'id, projectId, updatedAt',
      nodes: 'id, graphId',
      edges: 'id, graphId, sourceNodeId, targetNodeId',
      researchProjects: 'id, status, updatedAt',
      references: 'id, projectId, documentId, year',
      matrices: 'id, projectId, kind',
      tasks: 'id, projectId, status, dueAt, updatedAt',
      readingProgress: 'id, &documentId',
      syncQueue: '++sequence, &opId, [entityType+recordId], createdAt',
      settings: 'key',
      devices: 'id',
      auditEvents: 'id, entityId, at',
      blobs: 'id, documentId',
    });
    // v2 (this release): adds sync bookkeeping. Purely additive, so existing data is untouched.
    this.version(2).stores({ syncMeta: 'key' });
  }
}

/** Tables that hold syncable BaseRecords, keyed by their SyncEntityType. */
export const SYNC_TABLES = [
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
] as const;

export type SyncTableName = (typeof SYNC_TABLES)[number];
