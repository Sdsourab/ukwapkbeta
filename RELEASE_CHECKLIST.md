# RELEASE_CHECKLIST.md: final acceptance (tick only when verified)

Legend: [x] verified by automated test; [~] implemented, not browser-verified; [ ] not done

## Engines and data
- [x] Anchoring: capture/restore/ambiguity/orphan/message scope/stale-DOM regression
- [x] Database: CRUD, soft delete, cascades, undo/redo, outbox, search, backup/import, migration v1->v2
- [x] Graph model, validation, layout, JSON/SVG export/import
- [x] Sync engine: offline queue, idempotency, conflicts, convergence (reference server)
## Extension
- [x] Manifest/permissions/CSP/remote-code static verification; built bundles smoke-tested
- [x] Message validation, sender checks, origin binding; visits never recorded
- [~] Toolbar, highlight painting, restore on reload, sidebar, palette, shortcuts, popup, dashboard (jsdom only)
- [~] ChatGPT + DeepSeek adapters (unverified on live sites)
## PWA
- [x] Library, reader, notes, tags, collections, search, graphs list, research, settings, backup, trash (jsdom)
- [~] Graph editor interactions, install, offline, share target
- [~] Five themes (contrast computed; visuals unverified)
## Sync / security
- [~] Supabase schema + transport (syntax/mapping only); [ ] sign-in UI; [ ] RLS isolation verified on a live project
- [x] Guardrails: no AI endpoints, no secrets, no stray network code, innerHTML allow-list
## Quality
- [x] Typecheck, lint (0 errors), 308 tests, accessibility audit (jsdom), perf guards
- [ ] Real-browser accessibility/performance pass
## Not implemented
- [ ] PDF reading, table of contents
## Delivery
- [x] README, installation, deployment, testing report, known limitations, manual checklist, final ZIPs
- [ ] Manual browser checklist run and signed off
