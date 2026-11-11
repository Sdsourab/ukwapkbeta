# ARCHITECTURE_MAP.md

## Directory structure
```
docs/                      specification (source of truth) + ADRs
packages/
  domain/                  types, schemas, url, settings, messages, backup, citation
  anchor-engine/           normalize, capture, restore (pure) + dom (text map)
  graph-engine/            geometry, diagnostics, layout, export (JSON/SVG)
  database/                db (Dexie), context (write/outbox/undo), repo, <entity> repos,
                           search, backup-io, store (DataStore facade)
  sync-engine/             engine, MemoryTransport (reference server), SupabaseTransport
  ui/                      tokens, themes, components, icons, PaletteView
apps/
  pwa/                     React PWA: screens/, components/, graph/, lib/, vite.config.ts (CSP + service worker plugins)
  extension/               src/background (router, worker), src/content (controller, adapters, highlighter, ui/), src/dashboard, src/popup, build.mjs
scripts/                   verify-extension.mjs, package-extension.mjs
cloud/supabase/            schema.sql (RLS, ukw_push/ukw_pull) + README
tests/setup.ts             fake-indexeddb
```

## Data flow (local-first)
UI → `DataStore` repo method → `StoreContext.write` → one Dexie transaction { record put, outbox pointer (coalesced), audit event } → commit → change event (in-process listeners + BroadcastChannel to other tabs) + undo trace.
Search index is derived and lazily rebuilt after change events.

## Extension communication (implemented; contracts in `domain/messages.ts`, handlers in `background/router.ts`)
Content script ──(chrome.runtime.sendMessage, versioned envelope)──▶ background worker ──▶ `parseMessage` (zod) + sender check ──▶ `DataStore` (extension origin DB) ──▶ response; background broadcasts change events to tabs.
Content script never reads/writes IndexedDB.

## Database
Dexie v1 tables: documents, annotations, notes, tags, taggings, collections, collectionItems, graphs, nodes, edges, researchProjects, references, matrices, tasks, readingProgress, syncQueue, settings, devices, auditEvents, blobs. Soft delete via `deletedAt`; hard delete only via purge.

## Synchronisation (engine implemented and tested against MemoryTransport; Supabase transport + SQL unverified, no sign-in UI)
Outbox pointers → sync engine reads current records → push to Supabase with `opId` idempotency; pull by `updatedAt/rev`; conflicts → newest wins for scalar fields, conflict copy for note bodies (docs/07 §7.8). Not implemented yet.

## Extension surfaces
background (owns DB 'ukw-ext') <-> content script (controller + lazy shadow-DOM UI) via validated messages; dashboard page = PWA React app over the same DB;
popup talks to the tab (commands) and to the background (settings). Reads (`DOCUMENT_LOOKUP`) never create records.
