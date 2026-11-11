# CLAUDE.md — Permanent instructions for every session

## Product
**Universal Knowledge Workspace (UKW)** — a local-first research, annotation and knowledge-graph workspace.
Two connected surfaces sharing one data model: a **Chrome MV3 extension** (floating toolbar, highlights, side panel,
ChatGPT/DeepSeek adapters) and a **mobile-friendly PWA** (library, reader, graph editor, search, offline).
Guiding principle: **zero friction** — act on the page being read; no needless modals, tabs or navigation.

## Source of truth
`docs/` holds the specification (01-overview … 18-decision-log). Read the relevant file before building a feature.
If documents conflict, decide, then record the decision as an ADR in `docs/18-decision-log.md`.
Do not drop requirements because they are hard.

## HARD RESTRICTIONS
1. **No AI features or AI API integration in this phase** (docs ADR-006). Only modular extension points; never fake AI output.
2. Never put secret keys in client code. Cloud (Supabase) is optional; anon key + RLS only.
3. Never silently discard user data: soft delete (tombstones), explicit purge, import reports problems instead of dropping.
4. Do not claim a feature works until it has been tested. Distinguish: *implemented & tested* / *implemented, not browser-tested* / *needs external config* / *not implemented*.
5. No page mutation by the extension beyond: an injected shadow-DOM host (`data-ukw-ui`) and one `<style>` for `::highlight()`.

## Architecture (see ARCHITECTURE_MAP.md)
npm workspaces monorepo, TypeScript strict, internal packages consumed from source.
- `packages/domain` — types, zod schemas, URL normalisation, settings, extension message contracts, backup format, citation templates. No DOM/DB.
- `packages/anchor-engine` — text anchors: capture / restore (pure) + DOM text-map layer.
- `packages/graph-engine` — graph diagnostics, auto-layout, export/import validation, SVG export (pure).
- `packages/database` — Dexie schema, repositories, outbox, undo/redo, search, backup/import, `DataStore` facade.
- `packages/sync-engine` — sync engine, in-memory reference server, Supabase transport.
- `packages/ui` — theme tokens, components, command palette.
- `apps/pwa` — React + Vite PWA. `apps/extension` — MV3 extension.
UI code calls repositories (`DataStore`), never IndexedDB directly. Extension content scripts never touch the DB: they message the background worker, which validates (`parseMessage`) and owns the extension DB (ADR-008).

## Conventions
- Records extend `BaseRecord` (`id, createdAt, updatedAt, deletedAt?, schemaVersion, rev`). Writes go through `StoreContext.write` (transaction + outbox + audit + undo trace + change event).
- Group multi-step user actions with `store.batch(label, fn)` → one undo step.
- Booleans are not IndexedDB keys: never index flags.
- Highlight colours are stored as hex; render with alpha. Never inject user text via `innerHTML`.
- Errors: throw `UkwError(code, message)` with codes from `docs/08 §8.6`.
- Tests: Vitest (`npm test`), `fake-indexeddb` is loaded globally; DOM tests use `// @vitest-environment jsdom`.
- Verify with `npm run verify` (typecheck + tests + builds).

## Current status
Baseline complete and tested in Node/jsdom (308 tests). NOT browser-verified. See PROJECT_STATE.md and RELEASE_CHECKLIST.md.
Reads must never create records (privacy). Anchor thresholds, adapters and the Supabase SQL are unverified; do not claim otherwise.

## Resuming ("CONTINUE")
1. Read this file, `PROJECT_STATE.md`, `NEXT_STEPS.md`, the latest `SESSION_LOG.md` entry, `KNOWN_BLOCKERS.md`.
2. Run `npm install && npm run typecheck && npm test` and inspect the repository — do NOT trust earlier claims.
3. Do the **EXACT RESUME INSTRUCTION** at the bottom of `PROJECT_STATE.md`, then continue down `NEXT_STEPS.md`.
4. Before ending ANY session: update PROJECT_STATE, NEXT_STEPS, SESSION_LOG, ARCHITECTURE_MAP (if structure changed), KNOWN_BLOCKERS, docs/10-task-tracker.md; run tests; record results; commit.

## Environment notes
- No browser is available in the authoring sandbox: real-Chrome verification of the extension and PWA install/offline behaviour has NOT been possible and must be done by a human (see KNOWN_BLOCKERS B-01).
- npm registry is reachable; pip/npm installs work.
