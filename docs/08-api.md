# 08 — API & Messaging Contracts

## 8.1 API principles

- Use typed request/response contracts.
- Validate all inputs.
- Use stable IDs.
- Return structured errors.
- Keep client secrets out of the bundle.
- Local operations must not depend on cloud availability.
- API versioning is required before public integrations exist.

## 8.2 Extension internal messaging

Suggested message envelope:

```ts
type ExtensionMessage<T = unknown> = {
  id: string;
  type: string;
  version: 1;
  payload: T;
  sentAt: string;
};

type ExtensionResponse<T = unknown> = {
  id: string;
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
};
```

Example message types:
- `ANNOTATION_CREATE`
- `ANNOTATION_UPDATE`
- `ANNOTATION_DELETE`
- `ANNOTATION_LIST_FOR_DOCUMENT`
- `DOCUMENT_IDENTIFY`
- `ANCHOR_RESTORE`
- `SIDEBAR_OPEN`
- `SYNC_REQUEST`
- `SETTINGS_GET`
- `SETTINGS_UPDATE`

Never accept a message merely because it came from a webpage window. Validate sender context and message schema.

## 8.3 Local repository interface

```ts
interface AnnotationRepository {
  create(input: CreateAnnotationInput): Promise<AnnotationRecord>;
  update(id: string, patch: UpdateAnnotationInput): Promise<AnnotationRecord>;
  remove(id: string): Promise<void>;
  listByDocument(documentId: string): Promise<AnnotationRecord[]>;
  search(query: SearchInput): Promise<SearchResult[]>;
}
```

The UI should call a repository/service layer, not access IndexedDB directly from every component.

## 8.4 Cloud API concept

The first implementation may use Supabase client libraries rather than a custom REST server. Keep the domain contract independent of the provider.

Logical endpoints:
- `GET /documents`
- `POST /documents`
- `GET /documents/{id}`
- `GET /documents/{id}/annotations`
- `POST /annotations`
- `PATCH /annotations/{id}`
- `DELETE /annotations/{id}`
- `GET /graphs`
- `POST /graphs`
- `PUT /graphs/{id}`
- `GET /research-projects`
- `POST /sync/batch`
- `GET /sync/changes?cursor=...`

These are logical contracts, not a claim that a server has already been implemented.

## 8.5 Example annotation payload

```json
{
  "id": "uuid",
  "documentId": "uuid",
  "type": "highlight",
  "colour": "#F6D86B",
  "anchor": {
    "exact": "Selected source passage",
    "prefix": "Text before ",
    "suffix": " text after"
  },
  "status": "active",
  "schemaVersion": 1
}
```

## 8.6 Error codes

| Code | Meaning | User action |
|---|---|---|
| `VALIDATION_ERROR` | Invalid payload | Correct input |
| `NOT_FOUND` | Record unavailable | Refresh or return to library |
| `UNAUTHORIZED` | Session missing/expired | Sign in again |
| `FORBIDDEN` | User lacks access | Check account/workspace |
| `CONFLICT` | Concurrent edits | Review conflict copy |
| `OFFLINE` | Network unavailable | Continue locally |
| `QUOTA_EXCEEDED` | Cloud limit reached | Export backup / review quota |
| `ANCHOR_NOT_FOUND` | Source passage not found | Reattach manually |
| `UNSUPPORTED_PAGE` | Adapter cannot support page | Use quick capture |
| `INTERNAL_ERROR` | Unexpected failure | Retry and report diagnostics |

## 8.7 Sync contract

A sync operation should include:
- Operation ID.
- Entity type.
- Entity ID.
- Operation type.
- Schema version.
- Revision/version.
- Payload.
- Client timestamp.

Server response should identify:
- Accepted operations.
- Rejected operations.
- Conflicts.
- New remote changes.
- Next sync cursor.

## 8.8 Rate and payload limits

Set conservative client batch sizes and attachment size limits. Handle provider quotas gracefully. Do not assume free-tier quotas remain constant.
