# 10 — Task Tracker

Use this file as the single lightweight implementation tracker. Update status after each coding session.

## 10.1 Status definitions

- `BACKLOG`: Not started.
- `READY`: Requirements and dependencies are clear.
- `IN_PROGRESS`: Actively being built.
- `BLOCKED`: Waiting on a dependency or unresolved issue.
- `IN_REVIEW`: Implementation exists; tests/review pending.
- `DONE`: Acceptance criteria and tests pass.
- `DEFERRED`: Intentionally moved to a later phase.

> **Status key for this baseline (Session 1).** `DONE` is reserved for work whose acceptance criteria are covered by passing
> automated tests *and* has no browser-dependent behaviour left to check (§10.7 requires keyboard/responsive checks). Anything
> that draws on a real page, a real browser or a real server stays `IN_REVIEW`: the code and its logic-level tests exist, but
> a human must run `docs/MANUAL-BROWSER-CHECKLIST.md`. Not started: T-032 (sign-in UI). T-037 is partial (engine status API and
> a queued-changes counter exist; no per-device status screen). Not in this tracker but also **not implemented**: PDF reading
> (Phase 8) and a table of contents for long documents.

## 10.2 Foundation tasks

| ID | Task | Priority | Status | Depends on |
|---|---|---:|---|---|
| T-001 | Create repository and base folders | P0 | DONE | — |
| T-002 | Configure TypeScript and linting | P0 | DONE | T-001 |
| T-003 | Define shared domain types | P0 | DONE | T-001 |
| T-004 | Create design tokens and theme provider | P1 | IN_REVIEW | T-001 |
| T-005 | Configure IndexedDB/Dexie | P0 | DONE | T-003 |
| T-006 | Add database migration tests | P0 | DONE | T-005 |

## 10.3 Annotation tasks

| ID | Task | Priority | Status | Depends on |
|---|---|---:|---|---|
| T-010 | Detect text selection | P0 | IN_REVIEW | T-003 |
| T-011 | Capture text anchor | P0 | DONE | T-010 |
| T-012 | Render highlight | P0 | IN_REVIEW | T-010 |
| T-013 | Save annotation locally | P0 | DONE | T-005 |
| T-014 | Build floating toolbar | P0 | IN_REVIEW | T-010 |
| T-015 | Build contextual sidebar | P0 | IN_REVIEW | T-004 |
| T-016 | Add note editor | P0 | IN_REVIEW | T-013 |
| T-017 | Restore annotations on reload | P0 | IN_REVIEW | T-011,T-013 |
| T-018 | Add underline/strike-through | P1 | IN_REVIEW | T-012 |
| T-019 | Add bookmark | P1 | IN_REVIEW | T-013 |

## 10.4 Library and graph tasks

| ID | Task | Priority | Status | Depends on |
|---|---|---:|---|---|
| T-020 | Build document library | P1 | IN_REVIEW | T-005 |
| T-021 | Add tags and collections | P1 | IN_REVIEW | T-020 |
| T-022 | Add local search | P1 | IN_REVIEW | T-020 |
| T-023 | Add JSON backup/export | P0 | IN_REVIEW | T-005 |
| T-024 | Create graph data model | P1 | DONE | T-003 |
| T-025 | Build node/edge editor | P1 | IN_REVIEW | T-024 |
| T-026 | Link graph node to annotation | P1 | IN_REVIEW | T-024,T-013 |
| T-027 | Add graph export/import | P2 | IN_REVIEW | T-025 |

## 10.5 Sync and PWA tasks

| ID | Task | Priority | Status | Depends on |
|---|---|---:|---|---|
| T-030 | Build PWA shell | P1 | IN_REVIEW | T-004 |
| T-031 | Reuse shared domain repositories | P1 | DONE | T-005 |
| T-032 | Add authentication | P2 | BACKLOG | T-030 |
| T-033 | Create cloud schema and RLS | P2 | IN_REVIEW | T-032 |
| T-034 | Build sync outbox | P2 | DONE | T-033 |
| T-035 | Add conflict handling | P2 | DONE | T-034 |
| T-036 | Add offline PWA support | P1 | IN_REVIEW | T-030 |
| T-037 | Add device sync status | P2 | IN_PROGRESS | T-034 |

## 10.6 Session log

Copy this template after each development session:

```md
### YYYY-MM-DD — Session N
**Goal:**
**Completed:**
**Files changed:**
**Tests run:**
**Bugs found:**
**Current blocker:**
**Next action:**
```

### 2026-11-03 — Session 1
**Goal:** Turn the documentation into a working, tested product foundation: data layer, engines, PWA, extension, sync engine.
**Completed:** domain, anchor-engine, graph-engine, database (Dexie v2 + migration), ui (5 themes), PWA (library, reader, search, graphs, research, settings, backup/trash, offline shell), extension (MV3 background router, adapters, highlight renderer, controller, in-page UI, dashboard, popup, build + static verification), sync engine + reference server + Supabase schema.
**Files changed:** whole repository created (see ARCHITECTURE_MAP.md).
**Tests run:** 296 automated tests in 20 files (unit, jsdom integration, built-bundle smoke, axe accessibility), typecheck, ESLint (0 errors), production builds, static extension verification, mutation spot-checks.
**Bugs found (and fixed) by the tests:** stale text-map capture in the content controller; infinite re-push loop after a conflict; unranked palette matches; unhandled stale "Delete forever"; non-deterministic graph load order; missing not-found state for graphs; four WCAG defects.
**Current blocker:** no browser in the authoring sandbox (B-01): extension, PWA install/offline and visual themes are unverified in a real browser.
**Next action:** run docs/MANUAL-BROWSER-CHECKLIST.md; then PDF reading, sync sign-in UI, TOC.

## 10.7 Definition of done

A task is DONE only when:
- Code is implemented.
- Empty/loading/error states are handled.
- Relevant tests pass.
- Keyboard and responsive behaviour are checked where relevant.
- No secret is committed.
- Documentation is updated.
- Known limitation is recorded.
