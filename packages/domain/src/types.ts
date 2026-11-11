/**
 * Shared domain model. Mirrors docs/05-database.md §5.3 and extends it where the
 * feature catalogue (docs/06) requires more (see docs/18 ADR-008..ADR-011).
 */

export const SCHEMA_VERSION = 1;

export type IsoDate = string;

export interface BaseRecord {
  id: string;
  createdAt: IsoDate;
  updatedAt: IsoDate;
  /** Soft delete tombstone (docs/05 §5.7). */
  deletedAt?: IsoDate | null;
  schemaVersion: number;
  /** Monotonic revision, incremented on every local write. Used for sync conflict detection. */
  rev: number;
}

/* ------------------------------------------------------------------ documents */

export type SourceType = 'web' | 'conversation' | 'pdf' | 'manual';

export interface DocumentRecord extends BaseRecord {
  canonicalUrl: string;
  normalizedUrl: string;
  hostname?: string;
  title?: string;
  sourceType: SourceType;
  platform?: string;
  externalId?: string;
  contentFingerprint?: string;
  lastVisitedAt?: IsoDate;
  favicon?: string;
  isFavorite: boolean;
  isArchived: boolean;
  projectId?: string | null;
  /** Only for `manual` sources the user typed or pasted (never silently archived page copies). */
  content?: string;
  pageCount?: number;
}

/* ------------------------------------------------------------------ anchors */

export interface TextAnchor {
  exact: string;
  prefix?: string;
  suffix?: string;
  startOffset?: number;
  endOffset?: number;
  domPath?: string;
  selector?: string;
  textFingerprint?: string;
  messageId?: string;
  confidence?: number;
  /** Strategy that last matched this anchor (diagnostics only). */
  strategy?: AnchorStrategy;
}

export type AnchorStrategy = 'offset' | 'exact-context' | 'exact-unique' | 'loose-context' | 'message' | 'dom-path' | 'manual';

/** Location data for annotations without text anchors (page bookmarks, PDF rects, sticky notes). */
export interface AnnotationLocation {
  pageNumber?: number;
  /** PDF highlight rectangles in normalized page coordinates (0..1). */
  rects?: Array<{ x: number; y: number; w: number; h: number }>;
  scrollRatio?: number;
  headingId?: string;
}

/* ------------------------------------------------------------------ annotations */

export type AnnotationType = 'highlight' | 'underline' | 'strike' | 'bookmark' | 'sticky';
export type AnnotationStatus = 'active' | 'orphaned' | 'archived';
export type Priority = 'low' | 'normal' | 'high';

export interface AnnotationRecord extends BaseRecord {
  documentId: string;
  type: AnnotationType;
  colour?: string;
  /** Null for page-level bookmarks and sticky notes. */
  anchor: TextAnchor | null;
  location?: AnnotationLocation;
  status: AnnotationStatus;
  priority?: Priority;
  isFavorite: boolean;
  /** Short label for bookmarks / sticky notes. */
  label?: string;
}

/* ------------------------------------------------------------------ notes */

export type NoteFormat = 'plain' | 'markdown';

export interface NoteRecord extends BaseRecord {
  documentId?: string;
  annotationId?: string;
  projectId?: string | null;
  title?: string;
  body: string;
  format: NoteFormat;
  pinned: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  /** Set when the note was created as a conflict copy during sync. */
  conflictOf?: string;
}

/* ------------------------------------------------------------------ tags, collections */

export interface TagRecord extends BaseRecord {
  name: string;
  /** Case-insensitive unique key. */
  nameKey: string;
  colour?: string;
}

export type Taggable = 'annotation' | 'note' | 'document' | 'graph' | 'reference' | 'task';

export interface TaggingRecord extends BaseRecord {
  tagId: string;
  entityType: Taggable;
  entityId: string;
}

export type CollectionKind = 'collection' | 'folder';
export type CollectionEntityType = 'document' | 'annotation' | 'note' | 'graph' | 'task' | 'reference';

export interface CollectionRecord extends BaseRecord {
  name: string;
  kind: CollectionKind;
  parentId?: string | null;
  description?: string;
  colour?: string;
  sortOrder: number;
}

export interface CollectionItemRecord extends BaseRecord {
  collectionId: string;
  entityType: CollectionEntityType;
  entityId: string;
  sortOrder: number;
}

/* ------------------------------------------------------------------ graphs */

export type GraphKind =
  | 'knowledge'
  | 'mindmap'
  | 'concept'
  | 'flowchart'
  | 'timeline'
  | 'decision'
  | 'evidence'
  | 'hierarchy'
  | 'freeform';

export interface GraphViewport {
  x: number;
  y: number;
  zoom: number;
}

export interface GraphRecord extends BaseRecord {
  projectId?: string | null;
  title: string;
  kind: GraphKind;
  viewport: GraphViewport;
  gridEnabled: boolean;
  snapEnabled: boolean;
  isFavorite: boolean;
  isArchived: boolean;
  description?: string;
}

export type GraphNodeType =
  | 'text'
  | 'source'
  | 'note'
  | 'claim'
  | 'evidence'
  | 'question'
  | 'image'
  | 'task'
  | 'group';

export type NodeShape = 'rounded' | 'rect' | 'ellipse' | 'diamond' | 'pill';

export interface NodeSourceRef {
  documentId?: string;
  annotationId?: string;
  noteId?: string;
  projectId?: string;
  nodeId?: string;
}

export interface GraphNodeRecord extends BaseRecord {
  graphId: string;
  type: GraphNodeType;
  label: string;
  body?: string;
  position: { x: number; y: number };
  dimensions?: { width: number; height: number };
  shape: NodeShape;
  colour?: string;
  style?: Record<string, unknown>;
  sourceRef?: NodeSourceRef;
  /** Group membership: id of a `group` node containing this node. */
  groupId?: string | null;
}

export type ConnectorStyle = 'straight' | 'curved' | 'orthogonal';

export interface GraphEdgeRecord extends BaseRecord {
  graphId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  relationType?: string;
  directed: boolean;
  connector: ConnectorStyle;
  colour?: string;
  style?: Record<string, unknown>;
}

/* ------------------------------------------------------------------ research */

export type ResearchStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface ResearchItem {
  id: string;
  text: string;
  status: 'open' | 'in-progress' | 'resolved';
}

export interface ResearchProjectRecord extends BaseRecord {
  title: string;
  description?: string;
  status: ResearchStatus;
  questions: ResearchItem[];
  objectives: ResearchItem[];
  gaps: ResearchItem[];
  hypotheses: ResearchItem[];
  methodology?: string;
  isFavorite: boolean;
}

export type ReferenceEntryType = 'article' | 'book' | 'chapter' | 'report' | 'web' | 'conference' | 'thesis' | 'other';
export type ReadingStatus = 'unread' | 'reading' | 'read';

export interface Author {
  family: string;
  given?: string;
}

export interface ReferenceRecord extends BaseRecord {
  projectId?: string | null;
  documentId?: string | null;
  entryType: ReferenceEntryType;
  title: string;
  authors: Author[];
  year?: number;
  publicationDate?: string;
  journal?: string;
  publisher?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  url?: string;
  abstract?: string;
  keywords: string[];
  method?: string;
  findings?: string;
  limitations?: string;
  personalNotes?: string;
  readingStatus: ReadingStatus;
}

export type MatrixKind = 'evidence' | 'literature';

export interface MatrixColumn {
  id: string;
  label: string;
}

export interface MatrixRow {
  id: string;
  /** Linked reference (literature matrix) */
  referenceId?: string;
  label?: string;
  cells: Record<string, string>;
  sourceRef?: NodeSourceRef;
}

export interface MatrixRecord extends BaseRecord {
  projectId?: string | null;
  kind: MatrixKind;
  title: string;
  columns: MatrixColumn[];
  rows: MatrixRow[];
}

/* ------------------------------------------------------------------ tasks, reading */

export type TaskStatus = 'todo' | 'doing' | 'done' | 'blocked';

export interface TaskRecord extends BaseRecord {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: Priority;
  dueAt?: IsoDate | null;
  projectId?: string | null;
  documentId?: string | null;
  noteId?: string | null;
  annotationId?: string | null;
  nodeId?: string | null;
}

export interface ReadingProgressRecord extends BaseRecord {
  documentId: string;
  headingId?: string;
  scrollRatio: number;
  anchor?: TextAnchor;
  pageNumber?: number;
  secondsRead: number;
}

/* ------------------------------------------------------------------ sync, settings, misc */

export type SyncEntityType =
  | 'documents'
  | 'annotations'
  | 'notes'
  | 'tags'
  | 'taggings'
  | 'collections'
  | 'collectionItems'
  | 'graphs'
  | 'nodes'
  | 'edges'
  | 'researchProjects'
  | 'references'
  | 'matrices'
  | 'tasks'
  | 'readingProgress'
  | 'settings';

export type SyncOperation = 'upsert' | 'delete';

export interface SyncQueueItem {
  /** Auto-increment primary key (ordering). */
  sequence?: number;
  /** Idempotency key (docs/08 §8.7). */
  opId: string;
  entityType: SyncEntityType;
  recordId: string;
  operation: SyncOperation;
  rev: number;
  schemaVersion: number;
  clientTimestamp: IsoDate;
  payload?: unknown;
  createdAt: IsoDate;
  attempts: number;
  lastError?: string;
}

export interface SettingRecord {
  key: string;
  value: unknown;
  updatedAt: IsoDate;
}

export interface DeviceRecord {
  id: string;
  name: string;
  platform: 'extension' | 'pwa';
  createdAt: IsoDate;
  lastSyncAt?: IsoDate;
}

export interface AuditEventRecord {
  id: string;
  entityType: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'restore' | 'import' | 'purge';
  at: IsoDate;
  summary?: string;
}

export interface BlobRecord {
  id: string;
  documentId: string;
  mime: string;
  size: number;
  data: Blob;
  createdAt: IsoDate;
}

/* ------------------------------------------------------------------ search */

export type SearchEntityType = 'document' | 'annotation' | 'note' | 'graph' | 'node' | 'task' | 'reference' | 'project';

export interface SearchResult {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  snippet: string;
  score: number;
  documentId?: string;
  graphId?: string;
  colour?: string;
  updatedAt: IsoDate;
}

export interface SearchInput {
  query: string;
  types?: SearchEntityType[];
  documentId?: string;
  tagIds?: string[];
  colour?: string;
  projectId?: string;
  platform?: string;
  from?: IsoDate;
  to?: IsoDate;
  includeArchived?: boolean;
  limit?: number;
}
