# 18 — Architecture Decision Log

Record significant decisions with context and consequences. Do not rewrite old decisions; add a new entry when a decision changes.

## ADR-001 — Local-first persistence

**Status:** Accepted  
**Decision:** IndexedDB is the primary local persistence layer.

**Context:** The product must work without paid services and must not lose edits when offline.

**Consequences:**
- Local writes happen before cloud sync.
- Sync queue and conflict logic are required.
- PWA and extension need a shared data contract.

## ADR-002 — Browser extension plus PWA

**Status:** Accepted  
**Decision:** Desktop annotation uses an extension; mobile access uses a PWA.

**Context:** Standard Android Chrome does not provide the same general extension support as desktop Chrome.

**Consequences:**
- Same account and domain model should serve both.
- PWA provides library/reader/editor access.
- Universal overlay over arbitrary mobile apps is not promised.

## ADR-003 — Quote-based text anchors

**Status:** Accepted  
**Decision:** Store selected quote, prefix, suffix, and supporting metadata; do not rely only on CSS selectors.

**Context:** Modern sites change their DOM and may render content dynamically.

**Consequences:**
- Restoration engine is more complex.
- Ambiguous matches need user intervention.
- Platform adapters improve identity matching.

## ADR-004 — Contextual side panel

**Status:** Accepted  
**Decision:** Common annotation actions remain in an in-page collapsible panel.

**Context:** Repeated tab switching interrupts reading and research.

**Consequences:**
- Sidebar must preserve scroll position.
- UI must handle narrow viewports.
- Large graph editing may still use a dedicated workspace mode.

## ADR-005 — Structured graph data

**Status:** Accepted  
**Decision:** Store nodes and edges as structured editable records.

**Context:** An exported image cannot support editing, searching, or source navigation.

**Consequences:**
- Graph schema and migration strategy are required.
- Export should include JSON.
- Source references must remain stable.

## ADR-006 — No AI API in initial release

**Status:** Accepted  
**Decision:** AI summary, AI assistant, and AI API are excluded.

**Context:** Initial goal is a zero-budget, solo-developer product focused on reliable capture, organization, and visualization.

**Consequences:**
- All core features must work manually and deterministically.
- No API key or AI provider dependency.
- Future AI capability, if ever added, must be optional and separately scoped.

## ADR-007 — Supabase as optional cloud layer

**Status:** Proposed / validate before production  
**Decision:** Evaluate Supabase Auth and PostgreSQL with RLS for cross-device sync.

**Context:** A free-tier cloud option can reduce infrastructure work.

**Consequences:**
- Provider quotas and policies may change.
- RLS tests are mandatory.
- Local-first operation remains independent of the provider.

## ADR-008 — Extension and PWA keep separate IndexedDB stores

**Status:** Accepted
**Date:** 2026-11-03

### Context
A Chrome extension runs on its own origin (`chrome-extension://<id>`) and the PWA on an https origin. IndexedDB is partitioned per origin, so the two cannot share one local database. Content scripts also cannot use the extension's database (they would get the *page's* origin).

### Decision
- The extension's **background service worker owns the extension database**; content scripts and the sidebar talk to it through validated messages (docs/08 §8.2).
- The extension also ships a **dashboard page** (library, graph editor, search, settings) built from the same React code as the PWA, so a desktop user has the full workspace without the PWA.
- Data moves between the extension store and the PWA store through **cloud sync** (Phase 7) or **JSON backup export/import** (implemented). No hidden cross-origin bridge is attempted.

### Alternatives
One shared database via an iframe or `externally_connectable` bridge: fragile, hard to secure, and fails offline. Rejected.

### Consequences
Without cloud sync configured, desktop (extension) data and mobile (PWA) data are separate until the user exports/imports. This is a documented limitation (docs/15).

### Review trigger
Chrome shipping a stable shared-storage primitive for extension/PWA pairs.

## ADR-009 — Revision counter, unindexed flags and pointer-style outbox

**Status:** Accepted
**Date:** 2026-11-03

### Context
docs/05 §5.4 suggested indexing `pinned` (a boolean). IndexedDB cannot index booleans (those records are silently omitted from the index). docs/05 §5.5 describes an outbox with payloads.

### Decision
- Every record carries `rev` (incremented on each local write) in addition to `updatedAt`, for conflict detection.
- Boolean flags (`pinned`, `isFavorite`, `isArchived`) are **not indexed**; they are filtered in memory.
- The sync outbox stores **one coalesced pointer per record** (`entityType`, `recordId`, `operation`, `rev`, `opId`). The sync engine reads the current record when sending. This bounds the queue by record count and cannot hold stale payloads.
- Outbox rows are written in the **same transaction** as the record change.

### Alternatives
Full payload per operation: larger, duplicates data, risks sending stale content.

### Consequences
Sync must read current state at send time (acceptable: local-first). Purged records enqueue a `delete` pointer with no row.

### Review trigger
Evidence that coalescing loses information needed for conflict resolution.

## ADR-010 — Generalised taggings and nested collections

**Status:** Accepted
**Date:** 2026-11-03

### Context
docs/05 defines `annotation_tags` only, but FR-ORG requires tags on notes, documents, graphs, references and tasks, plus both collections and folders.

### Decision
- One `taggings` table (`tagId`, `entityType`, `entityId`) instead of `annotation_tags`.
- One `collections` table with `kind: 'collection' | 'folder'` and `parentId` for nesting; membership in `collectionItems`. Moves reject cycles.
- Tags are unique by a case-insensitive `nameKey`; a tombstoned tag with the same name is reused.

### Consequences
Cloud schema (Phase 7) must mirror these tables. Import/export map them one-to-one.

## ADR-011 — Anchor restoration is conservative and uncalibrated

**Status:** Accepted
**Date:** 2026-11-03

### Context
docs/07 §7.4 forbids treating restoration thresholds as universal truth; docs/11 §11.3 says a wrong restoration is worse than an unresolved one.

### Decision
- Order: offset fast path (only if a fingerprint of the surrounding text still matches) → exact quote scored by prefix/suffix agreement → loose match (case, whitespace and punctuation-insensitive, min. 12 characters) only when no exact match exists.
- Duplicates with indistinguishable context, and short quotes whose context vanished, return **ambiguous** (user chooses) rather than guessing. Edited quotes become **orphaned**.
- Thresholds live in one exported `THRESHOLDS` constant and are marked uncalibrated until measured on real pages.

### Consequences
Some legitimate highlights will surface as ambiguous/orphaned after large page rewrites. That is intended. Real-page calibration is tracked as NEXT_STEPS task A-07.

## ADR-012 — Undo is tombstone-based and per-process

**Status:** Accepted
**Date:** 2026-11-03

### Decision
Undo/redo restores record snapshots through the normal write path (new `rev`, new outbox pointer), so it syncs like any edit. Undoing a creation tombstones the record instead of hard-deleting it. History is in memory (100 steps) and owned by the process that holds the database (PWA tab, or the extension background worker). Related writes are grouped with `batch()` into one step; purges are not undoable.

### Consequences
Undo history does not survive a reload or a service-worker restart. Documented in docs/15.

## ADR-013 — Monorepo of source-consumed internal packages

**Status:** Accepted
**Date:** 2026-11-03

### Decision
npm workspaces: `packages/{domain,anchor-engine,graph-engine,database,sync-engine,ui}` and `apps/{pwa,extension}`. Internal packages export TypeScript source directly (no per-package build step); Vite/Vitest compile them. `domain` and the engines have no DOM or database dependency, so they are testable in Node.

## ADR template

```md
## ADR-NNN — Title

**Status:** Proposed | Accepted | Rejected | Superseded
**Date:** YYYY-MM-DD

### Context
What problem or constraint led to this decision?

### Decision
What is being chosen?

### Alternatives
What other options were considered?

### Consequences
What becomes easier, harder, or newly required?

### Review trigger
What evidence would justify revisiting this decision?
```
