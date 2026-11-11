# 14 — Changelog

All notable product and documentation changes should be recorded here.

## [0.1.0] — 2026-11-03 — First implementation baseline

### Added
- Monorepo (npm workspaces, TypeScript strict, Vitest, ESLint): `domain`, `anchor-engine`, `graph-engine`, `database`, `sync-engine`, `ui`, `apps/pwa`, `apps/extension`.
- Local-first Dexie database (schema v2) with soft delete, revisions, sync outbox, undo/redo, local full-text search, versioned JSON backup/import (merge/replace, atomic, safety backup) and Trash.
- Text anchoring engine: offset fast path, exact+context scoring, loose matching, ambiguity and orphan handling, manual reattach.
- Knowledge graph data model, validation, auto-layout (layered/radial/grid), JSON/SVG/PNG export, import with id remapping, source-linked nodes.
- Responsive PWA: library, reader with highlights, notes, tags, collections, global search, graph list and React Flow editor, research projects (trackers, references with citations, matrices, tasks), settings (five themes, palette, backup, trash), quick capture, share target, command palette, offline app shell.
- Chrome MV3 extension: validated message router, read-only page lookup (visits are never recorded), floating toolbar, popover, resizable sidebar (Highlights, Notes, Graph, Sources), command palette, keyboard commands, context menu, ChatGPT and DeepSeek adapters, library dashboard, toolbar popup.
- Sync engine with idempotent push, cursor pull, optimistic concurrency, last-writer-wins with note conflict copies, offline queue; in-memory reference server; Supabase transport and SQL schema with row-level security.
- Automated accessibility tests (axe-core) and static verification of the extension build.

### Not implemented
- PDF reading and PDF highlights; table of contents for long documents; sign-in UI for cloud sync; Firefox/Safari builds.

### Requires external configuration or manual verification
- Cloud sync (own Supabase project); real-browser verification of the extension, PWA install/offline and themes.

## [1.0.0] — Initial documentation baseline

### Added
- Product vision and scope.
- Functional and non-functional requirements.
- Modular extension + PWA architecture.
- UI/UX design system and multiple theme modes.
- Annotation and text restoration model.
- Knowledge graph and diagram studio specification.
- Research management and PDF workflows.
- Local-first storage and cloud synchronization design.
- Security, testing, deployment, and roadmap documentation.

### Explicitly excluded
- AI summaries.
- AI assistant.
- AI-generated research insights.
- AI API integration.

## Change entry template

```md
## [X.Y.Z] — YYYY-MM-DD

### Added
- 

### Changed
- 

### Fixed
- 

### Removed
- 

### Security
- 

### Migration notes
- 
```

## Documentation maintenance rules

- Update this file when user-visible behaviour changes.
- Link breaking data changes to a decision record.
- Mention any migration required.
- Do not claim a feature is released when it is only designed.
