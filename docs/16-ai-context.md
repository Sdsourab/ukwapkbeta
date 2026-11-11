# 16 — Coding Assistant Project Context

> This file is a context brief for any coding assistant used during development. It describes the project; it does not authorize adding AI features to the product.

## 16.1 Project summary

Build a local-first, cross-device web annotation and knowledge workspace consisting of:
1. A Chrome Manifest V3 extension.
2. A responsive PWA.
3. Shared TypeScript domain modules.
4. IndexedDB local persistence.
5. Optional cloud synchronization with authenticated PostgreSQL/RLS.

## 16.2 Non-negotiable product constraints

- Do not add AI summaries.
- Do not add an AI chat assistant.
- Do not call an AI API.
- Do not invent automatic AI extraction.
- Common workflows must avoid unnecessary tab switching.
- Save locally before cloud sync.
- Preserve original source links and text anchors.
- Store graph nodes and edges as editable structured data.
- Never silently move an annotation to a weak text match.
- Do not claim universal mobile overlay support.
- Do not put privileged secrets in browser code.

## 16.3 UX rules

- Source content remains visible.
- Selection toolbar appears near the selected text.
- Sidebar is contextual and collapsible.
- Notes can be edited in the sidebar.
- Graph quick actions should retain source context.
- Preserve scroll position.
- Use clear save and sync states.
- Design light, dark, system, dim, and high-contrast themes.
- Support keyboard navigation and responsive layouts.

## 16.4 Engineering rules

- TypeScript strict mode.
- Small modules with clear responsibilities.
- Domain logic outside React components.
- Repository layer for database access.
- Schema validation at data boundaries.
- Stable IDs and timestamps.
- Unit tests for anchor matching and sync logic.
- Site-specific logic belongs in adapters.
- Keep extension permissions minimal.
- Document every important architecture change.

## 16.5 Preferred implementation sequence

1. Domain types and local database.
2. Text selection and anchor capture.
3. Highlight rendering.
4. Local save and restoration.
5. Floating toolbar and sidebar.
6. Notes and bookmarks.
7. Library and export.
8. Graph editor.
9. Research and PDF modules.
10. Authentication and sync.
11. Mobile PWA.
12. Advanced productivity.

## 16.6 How to request code changes

For each task, provide:
- Exact feature ID.
- Relevant document section.
- Files allowed to change.
- Acceptance criteria.
- Tests required.
- Existing code context.

Ask the coding assistant to:
1. Inspect the current repository before editing.
2. Explain the proposed change briefly.
3. Implement only the requested scope.
4. Run tests/typecheck.
5. Report changed files and known limitations.
6. Avoid replacing working code without evidence.

## 16.7 Definition of a good coding response

A good implementation is:
- Small enough to review.
- Typed and validated.
- Tested.
- Accessible.
- Responsive.
- Compatible with local-first operation.
- Consistent with the data model.
- Honest about unsupported cases.
