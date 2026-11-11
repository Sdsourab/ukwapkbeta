# Universal Knowledge Workspace

A **local-first** research, annotation and knowledge-graph workspace that works on websites and AI conversations
(Chrome extension) and on your phone (installable PWA). Highlight, annotate, tag, connect ideas in editable graphs,
search everything, and keep it all on your own device. **No AI features are included in this phase.**

> **Honest status (read this first).** All logic is covered by 300+ automated tests, a production build of both apps
> exists, and the extension build passes static verification. **It has not been loaded into a real browser:** the
> authoring environment had none. Treat it as a tested foundation, not a verified release, until someone runs
> [`docs/MANUAL-BROWSER-CHECKLIST.md`](docs/MANUAL-BROWSER-CHECKLIST.md). See the status table below.

## What works, and how sure we are

| Area | Status |
|---|---|
| Local database, soft delete + Trash, undo/redo, local search, JSON backup/import (merge/replace), schema migration | **Implemented and automatically tested** |
| Text anchoring (restore after page changes, duplicates, deleted/edited text, manual reattach) | **Implemented and automatically tested** (jsdom fixtures; thresholds uncalibrated on real pages) |
| Knowledge-graph data model, validation, auto-layout, JSON/SVG export + import, source-linked nodes | **Implemented and automatically tested** |
| Sync engine (offline queue, idempotent push, pull, conflicts, note conflict copies) | **Implemented and tested against an in-memory reference server**, including randomized 3-device convergence |
| Extension background (message validation, sender checks, origin binding), page controller, adapters, in-page UI, built bundles | **Implemented and tested in jsdom + against the built bundles** |
| PWA screens (library, reader, notes, tags, collections, search, graphs, research, settings, backup, trash, quick capture, palette) | **Implemented and tested in jsdom**, accessibility audited with axe-core |
| Five themes with WCAG-checked contrast | **Tokens tested**; visual appearance not checked in a browser |
| Highlight painting on real pages, toolbar placement, sidebar layout, strict-CSP sites | **Implemented, not verified in a browser** |
| ChatGPT / DeepSeek adapters | **Implemented against assumed page structure; unverified on the live sites** |
| PWA install, offline start, share target, service-worker updates | **Implemented, not verified in a browser** |
| Graph editor interactions (drag, touch, resize, minimap, PNG export) | **Implemented; mount + core flow smoke-tested, interactions not verified in a browser** |
| Cloud sync with a real Supabase project | **Needs external configuration.** SQL + transport written (SQL syntax-checked only); **no sign-in UI yet** |
| PDF reading and highlights, table of contents for long documents | **Not implemented** |

Details: [`docs/KNOWN-LIMITATIONS.md`](docs/KNOWN-LIMITATIONS.md), [`docs/TESTING-REPORT.md`](docs/TESTING-REPORT.md), [`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

## Quick start

```bash
npm install
npm run dev                 # PWA at http://localhost:5173
npm run build               # production builds of the PWA and the extension
npm run verify              # typecheck + build + extension verification + all tests
```

Load the extension: build it, open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select
`apps/extension/dist`. Full steps: [`docs/INSTALLATION.md`](docs/INSTALLATION.md). Hosting: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Using it

- **Highlight:** select text on any page, then click a colour in the floating toolbar (or press `Alt+H`).
  Underline, strikethrough and "highlight + note" are next to the colours.
- **Sidebar:** `Alt+S`, or the small tab on the page edge. Tabs: Highlights, Notes, Graph, Sources. Drag its edge or use the arrow keys to resize.
- **Command palette:** `Alt+K` on pages, `Ctrl/⌘+K` in the library.
- **Bookmark a spot:** `Alt+B`. **Note on a selection:** `Alt+N`.
- **Library, graphs, research, settings:** the extension's toolbar button → *Open library*, or the PWA.
- Visiting a page records **nothing**. A page enters your library only when you first annotate it.

## Repository layout

```
apps/pwa            React PWA (library, reader, graph editor, research, settings, offline shell)
apps/extension      Chrome MV3 extension (background worker, content script, in-page UI, dashboard, popup)
packages/domain     types, schemas, URL identity, settings, message contracts, backup format, citations
packages/anchor-engine  text anchors: capture / restore / DOM mapping
packages/graph-engine   graph diagnostics, auto-layout, export/import, SVG
packages/database   Dexie schema + repositories + outbox + undo + search + backup (DataStore)
packages/sync-engine    sync engine, reference server, Supabase transport
packages/ui         themes, tokens, shared components, command palette
cloud/supabase      SQL schema (RLS) and setup guide for optional sync
docs/               the specification (01–18) plus install, deployment, testing, limitations
CLAUDE.md PROJECT_STATE.md NEXT_STEPS.md SESSION_LOG.md ARCHITECTURE_MAP.md KNOWN_BLOCKERS.md RELEASE_CHECKLIST.md
```

## Privacy and security in one paragraph

Data lives in your browser's IndexedDB. The only network code in the product is the optional sync transport, and a
test fails the build if any other network call, AI endpoint, analytics library, secret or unaudited `innerHTML` appears.
The extension asks for `contextMenus` and `unlimitedStorage` plus access to http(s) pages (needed to restore highlights);
every message from a page is schema-validated, the sender is checked, and page identity must match the sender's origin.

## Continuing development

Read `CLAUDE.md`, then `PROJECT_STATE.md` (ends with the exact resume instruction) and `NEXT_STEPS.md`. Every session
must update those files and `docs/10-task-tracker.md` before it ends.

## Native Android companion

A lightweight native Android capture app is included under [`android/`](android/README.md). It receives Android text-selection and Sharesheet text, then saves quotes and annotations to a private SQLite library. It is intentionally dependency-free to keep the APK small. **This initial Android companion is local-only**: Supabase/Laptop live sync, AccessibilityService capture, floating overlay and persistent in-other-app highlighting are not implemented yet. Build the APK using the root GitHub Actions workflow `.github/workflows/android-apk.yml`.
