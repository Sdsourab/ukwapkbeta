# 15 — Known Issues, Risks & Limitations

This is a planning risk register. Items are expected engineering challenges, not claims that every issue has already occurred.

## 15.1 Compatibility risks

### Dynamic websites
Modern websites frequently change their DOM. A selector-based annotation can break.

Mitigation:
- Quote-based text anchors.
- Prefix/suffix matching.
- Platform adapters.
- Confidence scoring.
- Manual reattach workflow.
- Compatibility test fixtures.

### Virtualized conversations
Some AI platforms render only visible messages. A message may not exist in the DOM until scrolled into view.

Mitigation:
- Adapter-specific message discovery.
- Restore visible annotations first.
- Provide a clear unresolved state.
- Avoid expensive full-page mutation scans.

### Shadow DOM and embedded frames
Some content may be inside shadow roots or cross-origin frames.

Mitigation:
- Document capability limits.
- Add explicit support only after testing.
- Never promise universal access.

## 15.2 Mobile limitations

Android Chrome does not provide the same general extension environment as desktop Chrome. A PWA can show and edit synchronized annotations, but cannot draw a universal overlay over arbitrary native apps or every browser page.

Mitigation:
- PWA library and reader.
- Share-to-app capture.
- Open original source link.
- Optional browser-specific add-on only after compatibility research.

## 15.3 PDF limitations

- Scanned PDFs may have no selectable text layer.
- Complex layouts can make text selection inaccurate.
- Some PDF viewers restrict integration.
- Annotated PDF export may not preserve every annotation style.

Mitigation:
- Support text-based PDFs first.
- Offer page-level notes/bookmarks as fallback.
- Make unsupported capabilities visible.

## 15.4 Sync risks

- Simultaneous edits.
- Deleted records reappearing.
- Duplicate sync operations.
- Provider quota limits.
- Network interruption.
- Inactive free-tier projects may be paused depending on provider policy.

Mitigation:
- Idempotent operations.
- Tombstones.
- Revision numbers.
- Conflict copies.
- Export/restore.
- Provider quota monitoring.

## 15.5 Performance risks

- Too many DOM observers.
- Rendering thousands of highlights.
- Large graphs.
- Huge notes and attachments.
- Search index growth.

Mitigation:
- Lazy rendering.
- Virtualized lists.
- Indexed queries.
- Debounced writes.
- Graph viewport culling.
- Attachment size limits.

## 15.6 Solo development risk

The complete product is too broad to deliver at production quality in one short build cycle.

Mitigation:
- Strict phase gates.
- Build annotation core first.
- Use reusable domain modules.
- Defer advanced features without deleting them from the master scope.
- Keep a working release after every phase.

## 15.7 Explicit product limitations

- No AI summary or AI assistant in this version.
- No guarantee of restoration on every changing website.
- No universal overlay on native mobile apps.
- No automatic capture of all webpage content by default.
- No collaborative multi-user editing in the initial release.

## 15.X Implementation-time findings (0.1.0)

These are limitations of the current implementation, recorded as required by docs/10 §10.7.

| ID | Limitation | Impact | Workaround / plan |
|---|---|---|---|
| KI-001 | The extension and the PWA have separate local databases (different browser origins). | Desktop and phone data meet only through cloud sync or JSON backup. | Use backup export/import; finish the sync sign-in UI (ADR-008). |
| KI-002 | The extension requests access to all http(s) sites to restore highlights automatically. | Broad install-time permission prompt. | Documented trade-off; per-site opt-in with optional host permissions is planned. Visits are never recorded. |
| KI-003 | ChatGPT/DeepSeek adapters are UNVERIFIED against the live sites. ChatGPT relies on `data-message-id`; DeepSeek has no message scoping. | Highlights in chats may restore less precisely or become "location lost". | Whole-page anchoring fallback and manual reattach; verify with the manual checklist. |
| KI-004 | Anchor restoration thresholds are uncalibrated on real pages (ADR-011). | Some highlights may show as ambiguous/orphaned after large page rewrites. | By design conservative; calibrate with a real corpus. |
| KI-005 | Undo history is in memory (100 steps) and is lost on reload or service-worker restart (ADR-012). | Cannot undo after a reload. Deleted items stay recoverable in Trash. | Trash + backups. |
| KI-006 | Cloud sync has no sign-in UI; the Supabase SQL was syntax-checked but never run against a live project. | Sync cannot be used by an end user yet. | Engine is tested against a reference server; follow cloud/supabase/README.md and complete the UI. |
| KI-007 | Conflict resolution is last-writer-wins per record (note text is preserved as conflict copies). | A concurrent edit to a non-note record loses the older edit. | Documented policy (docs/07 §7.8). |
| KI-008 | PDF reading and table of contents are not implemented. `pageNumber`/`rects` exist in the data model. | No PDF workflow. | Phase 8 work. |
| KI-009 | Highlights are drawn with the CSS Custom Highlight API (Chrome 105+). Without it an overlay fallback is used (untested in a browser). | Possible misalignment on unusual layouts. | Manual checklist; keep Chrome up to date. |
| KI-010 | Pages that virtualise or re-render text can leave highlights unresolved until the text exists again. | Delayed or missing highlights on very dynamic pages. | Mutation observer re-restores; unresolved items are listed in the sidebar. |
| KI-011 | The in-page UI overlays the page rather than pushing it, so it can cover page content. | Content under the sidebar is hidden while it is open. | Resize, move to the other side, or close it. |
| KI-012 | Strict-CSP sites: styles are applied via adopted stylesheets (not blocked), but a site that blocks `data:`/inline in other ways is untested. | Unknown on some sites. | Manual checklist (GitHub-like CSP). |
| KI-013 | Bundle size: PWA main chunk ~650 kB (195 kB gzip), extension content script ~385 kB, because zod and Dexie are bundled everywhere. | Slower first load/parse. | Split the UI bundle for lazy injection; use `zod/mini`. |
| KI-014 | The graph editor's canvas behaviour (touch gestures, drag, resize, minimap) is not verified in a real browser; PNG export is untested. | Possible interaction defects on touch devices. | Manual checklist. |
