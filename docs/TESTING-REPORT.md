# Testing report: 0.1.0 baseline

Generated from a real run on the authoring machine (Node 22, jsdom, fake-indexeddb). **No real browser was available**, so
nothing here verifies behaviour in Chrome; see `docs/MANUAL-BROWSER-CHECKLIST.md`.

## Result
- **308 tests, 308 passed, 0 failed** in 21 files (`npm test`).
- `npm run typecheck`: clean (TypeScript strict). `npm run lint`: 0 errors (✖ 16 problems (0 errors, 16 warnings)); warnings are `any` in dynamic-table wrappers.
- `npm run build`: PWA and extension build. `npm run verify:extension`: manifest, file references, permissions, CSP, remote-code and size checks pass.
- `npm run verify` runs all of the above in order.

| Area | Tests | Passed | Files |
|---|---|---|---|
| built extension bundles | 5 | 5 | 1 |
| repository guardrails | 11 | 11 | 1 |
| PWA screens | 38 | 38 | 3 |
| anchor-engine | 27 | 27 | 2 |
| database | 57 | 57 | 3 |
| domain | 25 | 25 | 1 |
| graph-engine | 16 | 16 | 1 |
| sync-engine | 25 | 25 | 1 |
| ui (components, themes) | 28 | 28 | 2 |
| extension background | 16 | 16 | 1 |
| extension content + in-page UI | 60 | 60 | 5 |

## What the tests cover (mapped to docs/11)
| docs/11 area | Automated coverage | Not covered automatically |
|---|---|---|
| §11.3 anchor fixtures (unchanged, inserted paragraph, whitespace/punctuation, duplicates, deleted, reordered, dynamic, edited) | All, in pure and jsdom form; message-scoped anchoring; stale-DOM capture regression | Real pages; threshold calibration |
| §11.4 graph (create/connect/move/delete cascade/undo/group/duplicate/export/import/layout, integrity) | Data layer + engine fully; editor mount, render, add-node and inspector edit smoke-tested | Touch gestures, drag/resize in a browser, PNG export |
| §11.5 sync (offline queue, retries, idempotent replay, conflicts, note copies, delete/restore, pagination, convergence) | All against the reference server, including 3 randomized 3-device runs with a flaky network | A live Supabase server; row-level-security isolation (SQL only syntax-checked) |
| §11.6 security (no secrets, no AI, minimal permissions, sender/origin checks, message validation, no unaudited HTML, no stray network code) | Repository guardrail tests, router tests, built-bundle tests, extension verifier | Penetration testing; hostile-page behaviour in Chrome |
| §11.7 performance | 300 loose restores on 1.1 MB < 8 s (measured ≈ 0.3 s); 1 MB exact restore < 0.5 s; search 5,000 annotations < 300 ms; import 5,000 annotations < 15 s; layout 500 nodes < 2 s | Phone-class devices; page-load impact of the content script |
| Accessibility | axe-core (WCAG 2.1 A/AA) on every PWA screen, dialogs, palette and the in-page extension UI; contrast ratios of all five themes computed against WCAG | Colour-contrast in rendered pages, screen-reader walkthroughs, keyboard-only walkthrough in a browser |
| §11.8 manual checklist | Written in `docs/MANUAL-BROWSER-CHECKLIST.md` | **Not run** |

## Defects the tests found and that were fixed this session
1. Content controller built anchors from a **cached, possibly stale text map** (wrong quote/offsets after the page changed). Regression test proven to fail without the fix.
2. Sync engine **looped forever** re-sending an operation after winning a conflict (servers replay the cached answer for a repeated `opId`). Now a fresh `opId` per retry.
3. Restoring many highlights on a large changed page took **40 s**; page normalisation is now memoised (≈ 0.3 s).
4. Command palette ranked "Theme: light" first for "theme: dark" (hidden keywords outranked titles).
5. "Delete forever" on an already-restored item failed silently; now reports the error.
6. Graph load order was random; now deterministic. Opening a missing graph showed a generic error; now "Graph not found".
7. Rejected sync operations were retried several times in one run; newer-schema records were double-counted.
8. Four WCAG issues: invalid `role="listitem"` on a label, skipped heading levels in empty states, dialog header/footer exposed as duplicate landmarks.
9. A test that accepted either outcome (`matched` or `ambiguous`) was replaced by strict assertions, which exposed an incorrect fixture.

## Test-quality checks
Mutation spot-checks (a deliberate bug is introduced, the suite must fail, the code is restored): outbox coalescing, undo of creations, graph edge validation, stale-map capture (twice: the first regression test was vacuous and was rewritten), remote updates ignored in sync, manifest and guardrail violations. All were detected after the fixes noted above.

## Known gaps in testing
Coverage percentage was not measured. The built content script is exercised in jsdom with a stubbed `chrome` API, which is not a substitute for Chrome. CSS Custom Highlight painting, overlay fallback geometry, service-worker lifecycle (MV3 worker suspension) and real IndexedDB eviction behaviour are untested.
