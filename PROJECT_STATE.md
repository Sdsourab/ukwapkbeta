# PROJECT_STATE.md: authoritative current state

_Last updated: end of Session 1._

## Current phase
Phases 0-7 built to a **tested baseline**; Phase 8 partly (research tools yes, PDF no); Phase 9 tested in Node/jsdom only; Phase 10 delivery documents written.
The product is **not verified in a real browser** (B-01). Do not call it released until `docs/MANUAL-BROWSER-CHECKLIST.md` passes.

## Completed (implemented and covered by passing automated tests)
domain, anchor-engine, graph-engine, database (Dexie v2 + migration), sync-engine (engine + reference server), ui (5 themes, components, palette),
PWA screens, extension (router, adapters, controller, in-page UI, dashboard, popup, build + verifier), guardrails, accessibility audit.

## Implemented but not verified in a browser
Highlight painting/toolbar/sidebar on real pages, ChatGPT/DeepSeek adapters, PWA install/offline/share target, themes visually, graph-editor touch/drag/PNG export.

## Not implemented
PDF reading/highlights, table of contents, sync sign-in UI, per-site optional permissions, Firefox/Safari builds, push-the-page sidebar mode, image nodes.

## Needs external configuration
Cloud sync (own Supabase project; `cloud/supabase/schema.sql` only syntax-checked).

## Application status
`npm install && npm run verify` succeeds. PWA: `npm run dev`. Extension: build, then Load unpacked `apps/extension/dist`.

## Last test run
`npm run verify`: typecheck clean, lint 0 errors, both builds OK, extension verification OK, **308 tests / 21 files passing** (see docs/TESTING-REPORT.md).

## Known bugs
None known in tested code. Open limitations: docs/15-known-issues.md KI-001..KI-014.

## Blockers
B-01 no browser (see KNOWN_BLOCKERS.md).

## EXACT RESUME INSTRUCTION
1. `npm install && npm run verify` (expect 308 passing).
2. A human (or a session with a browser) runs `docs/MANUAL-BROWSER-CHECKLIST.md`; fix what fails, starting with the extension on a real article, then ChatGPT/DeepSeek adapters. Record results in SESSION_LOG.md.
3. Then build **PDF reading** (NEXT_STEPS A-14) and the **sync sign-in UI** (A-12b).
