# 05 — Database Design

## 5.1 Data principles

- Every record has a stable UUID.
- Every user-owned cloud record has an `owner_id`.
- Use ISO timestamps in UTC.
- Keep canonical content separate from rendered UI state.
- Store graph structures as editable JSON or relational records.
- Store source anchors as structured data.
- Version import/export formats.
- Local database must work without an account.

## 5.2 Core entities

| Entity | Purpose |
|---|---|
| `users` | Authenticated profile |
| `devices` | User device metadata |
| `documents` | Webpage, conversation, PDF, or imported source |
| `annotations` | Highlight, underline, strike-through, bookmark marker |
| `anchors` | Quote and restoration metadata |
| `notes` | Rich text or plain text notes |
| `tags` | Reusable labels |
| `annotation_tags` | Many-to-many tag mapping |
| `collections` | User-defined groups |
| `collection_items` | Items inside collections |
| `graphs` | Graph document metadata |
| `nodes` | Editable graph nodes |
| `edges` | Node relationships |
| `research_projects` | Research workspace |
| `references` | Bibliographic source metadata |
| `tasks` | Follow-up actions |
| `reading_progress` | Saved position and progress |
| `sync_queue` | Pending local cloud operations |
| `audit_events` | Local/cloud change history where appropriate |

## 5.3 Suggested local schema

```ts
type BaseRecord = {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  schemaVersion: number;
};

type DocumentRecord = BaseRecord & {
  canonicalUrl: string;
  normalizedUrl: string;
  title?: string;
  sourceType: "web" | "conversation" | "pdf" | "manual";
  platform?: string;
  externalId?: string;
  contentFingerprint?: string;
  lastVisitedAt?: string;
};

type TextAnchor = {
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
};

type AnnotationRecord = BaseRecord & {
  documentId: string;
  type: "highlight" | "underline" | "strike" | "bookmark";
  colour?: string;
  anchor: TextAnchor;
  status: "active" | "orphaned" | "archived";
  priority?: "low" | "normal" | "high";
};

type NoteRecord = BaseRecord & {
  documentId?: string;
  annotationId?: string;
  title?: string;
  body: string;
  format: "plain" | "markdown";
  pinned: boolean;
};

type GraphNode = {
  id: string;
  graphId: string;
  type: string;
  label: string;
  body?: string;
  position: { x: number; y: number };
  dimensions?: { width: number; height: number };
  style?: Record<string, unknown>;
  sourceRef?: { documentId?: string; annotationId?: string; noteId?: string };
};

type GraphEdge = {
  id: string;
  graphId: string;
  sourceNodeId: string;
  targetNodeId: string;
  label?: string;
  relationType?: string;
  directed: boolean;
  style?: Record<string, unknown>;
};
```

## 5.4 IndexedDB / Dexie tables

Suggested initial tables:
- `documents`
- `annotations`
- `notes`
- `tags`
- `annotationTags`
- `collections`
- `collectionItems`
- `graphs`
- `nodes`
- `edges`
- `researchProjects`
- `references`
- `tasks`
- `readingProgress`
- `syncQueue`
- `settings`

Example Dexie index plan (adjust after profiling):

```ts
db.version(1).stores({
  documents: "id, normalizedUrl, sourceType, platform, updatedAt",
  annotations: "id, documentId, type, status, updatedAt",
  notes: "id, documentId, annotationId, pinned, updatedAt",
  tags: "id, name",
  graphs: "id, projectId, updatedAt",
  nodes: "id, graphId, type",
  edges: "id, graphId, sourceNodeId, targetNodeId",
  tasks: "id, projectId, status, dueAt, updatedAt",
  syncQueue: "++sequence, recordId, entityType, operation, createdAt"
});
```

## 5.5 Cloud relational model

Recommended PostgreSQL tables:
- `profiles`
- `documents`
- `annotations`
- `notes`
- `tags`
- `annotation_tags`
- `collections`
- `collection_items`
- `graphs`
- `graph_nodes`
- `graph_edges`
- `research_projects`
- `references`
- `tasks`
- `reading_progress`
- `device_sync_state`

Use `owner_id` on user-owned tables. Enable Row Level Security and policies that restrict every read/write to the authenticated owner.

## 5.6 Relationships

- One document has many annotations.
- One annotation may have many notes.
- One annotation may have many tags.
- One graph has many nodes and edges.
- One node may reference one source annotation or document.
- One research project has many documents, references, graphs, and tasks.
- A collection may contain different entity types through a typed collection-item table.

## 5.7 Deletion strategy

Use soft delete initially:
- Set `deletedAt`.
- Hide from normal lists.
- Keep tombstone until sync has propagated.
- Allow restore from Trash.
- Permanent deletion is a separate explicit action.

## 5.8 Migrations and validation

- Every exported backup includes `schemaVersion`.
- Validate imported JSON before writing.
- Migrations must be repeatable and tested against sample backups.
- Never silently discard unknown fields during import.
- Keep a backup before destructive migrations.

## 5.9 Data retention

Define a clear policy for:
- Deleted items.
- Sync tombstones.
- Local cache.
- Imported document content.
- Attachments.
- Account deletion.

Do not store full webpage copies by default unless the user explicitly chooses a capture mode and the content can legally and technically be stored.
