# NEXT_STEPS.md: prioritised queue
Status: TODO, IN_PROGRESS, DONE, BLOCKED. `T-xxx` ids refer to docs/10-task-tracker.md.

| ID | Task | Priority | Depends on | Completion criteria | Status |
|---|---|---|---|---|---|
| B-1 | Run docs/MANUAL-BROWSER-CHECKLIST.md in Chrome; fix every failure | P0 | a browser | All boxes ticked and logged; tracker IN_REVIEW items → DONE | TODO (B-01) |
| A-07 | Calibrate anchor THRESHOLDS on a corpus of real pages (ADR-011) | P0 | B-1 | Measured restore rates documented; thresholds adjusted | TODO |
| A-06 | Verify and harden ChatGPT/DeepSeek adapters against the live sites | P0 | B-1 | Message-scoped anchoring works across reload/thread switch | TODO |
| A-14 | PDF reading with pdf.js: page nav, outline/TOC, page notes, rect highlights (data model already has pageNumber/rects, blobs table exists) | P1 | A-02 done | Open a local PDF, annotate, reload, restore; tests with a fixture PDF | TODO |
| A-12b | Sync sign-in UI (email auth), token refresh, secure session storage, sync status screen, sign-out flow; verify schema.sql on a live project incl. RLS isolation | P1 | Supabase project | cloud/supabase/README verification list passes | TODO |
| A-16 | Table of contents + heading navigation for long text sources | P1 | none | Headings detected, TOC with jump + progress | TODO |
| A-17 | Reduce bundles: split content UI bundle (lazy injection), `zod/mini`, code-split PWA routes | P2 | none | Content script < 150 kB; PWA main < 400 kB | TODO |
| A-18 | Per-site optional host permissions instead of all http(s) | P2 | B-1 | Highlights restore only on sites the user enabled | TODO |
| A-19 | Sidebar "push page" mode (opt-in), mobile share-to-app polish, task reminders | P2 | B-1 | Verified in browser | TODO |
| A-20 | CI (GitHub Actions): verify + lint on every push | P2 | none | Green badge | TODO |
| A-21 | Coverage measurement and thresholds | P2 | none | Report generated | TODO |
