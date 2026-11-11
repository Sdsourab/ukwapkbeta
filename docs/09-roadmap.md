# 09 — Development Roadmap

## 9.1 Strategy

Build the product in vertical slices. Each phase should produce a working, testable experience. Do not build every screen before the underlying data and restoration engine work.

## Phase 0 — Foundation

Deliver:
- Repository structure.
- TypeScript configuration.
- Linting and formatting.
- Shared domain types.
- Theme tokens.
- Basic extension scaffold.
- Basic PWA scaffold.
- Local database and migration baseline.

Exit criteria:
- Both apps build.
- A sample record can be written and read.
- Documentation and task tracker are in place.

## Phase 1 — Annotation MVP

Deliver:
- Selection detection.
- Floating toolbar.
- Multi-colour highlight.
- Underline and strike-through.
- Notes attached to highlights.
- Bookmark.
- Local persistence.
- Current-page sidebar.
- Edit/delete.
- Basic source restoration.

Exit criteria:
- Create, reload, restore, edit, and delete on a controlled set of test pages.
- No destructive text-node rewriting.
- Scroll position preserved.

## Phase 2 — Reliability and platform adapters

Deliver:
- Anchor confidence scoring.
- Orphaned annotation handling.
- URL normalization.
- General webpage adapter.
- Initial adapters for selected AI web platforms.
- Compatibility status.
- Diagnostics and test fixtures.

Exit criteria:
- Each adapter has a documented capability matrix.
- DOM change tests do not silently misplace highlights.

## Phase 3 — Library and search

Deliver:
- Unified library.
- Notes/highlights/bookmarks lists.
- Tags and collections.
- Local search.
- Favorites/archive/trash.
- Export/import JSON.

Exit criteria:
- User can find and export every saved record.

## Phase 4 — Graph and diagram studio

Deliver:
- Graph CRUD.
- Node and edge CRUD.
- Source-linked nodes.
- Zoom/pan/minimap.
- Undo/redo baseline.
- JSON and SVG/PNG export.
- Graph templates.

Exit criteria:
- Graph remains editable after reload and export/import.

## Phase 5 — Research workspace and PDF

Deliver:
- Research projects.
- References and metadata.
- Evidence matrix.
- Citation templates.
- PDF reader and supported annotations.
- Reading progress.

Exit criteria:
- Research records link to documents, annotations, and graph nodes.

## Phase 6 — Authentication and cloud sync

Deliver:
- Account flow.
- PostgreSQL schema.
- RLS policies.
- Outbox sync.
- Remote change cursor.
- Conflict UI.
- Device/session settings.

Exit criteria:
- Two devices can sync a test account without data leakage.
- Offline changes eventually synchronize.
- Conflict behaviour is tested.

## Phase 7 — Mobile PWA

Deliver:
- Responsive library.
- Note editor.
- Highlight viewer.
- Graph viewer/editor.
- PDF reader.
- Share-to-app capture where supported.
- Offline caching.

Exit criteria:
- Mobile user can view/edit the same account data.
- Limitations of in-page overlay are clearly explained.

## Phase 8 — Advanced productivity

Deliver:
- Tasks.
- Calendar/timeline.
- Advanced filters.
- Saved views.
- Analytics.
- Advanced customization.
- More export formats.

## 9.2 Suggested solo-developer sequence

1. Learn and validate browser selection behaviour.
2. Build local annotation persistence.
3. Build restoration tests before adding many sites.
4. Build contextual sidebar.
5. Add library and export.
6. Build graph module.
7. Add cloud sync only after local data model is stable.
8. Build mobile PWA against the same domain model.

## 9.3 Release gates

A phase cannot be called complete if:
- Data is lost on reload.
- A source anchor can silently jump to the wrong text.
- Core action requires unnecessary tab switching.
- Sync status is misleading.
- Backup cannot be restored.
- A critical security rule is untested.
