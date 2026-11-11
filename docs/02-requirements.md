# 02 — Product Requirements

## 2.1 Requirement conventions

- **MUST:** Required for release acceptance.
- **SHOULD:** Strongly recommended.
- **MAY:** Optional or later enhancement.
- IDs are stable references for tasks and tests.

## 2.2 Functional requirements

### Annotation
- `FR-ANN-001` MUST allow users to highlight selected text on supported pages.
- `FR-ANN-002` MUST support multiple highlight colours.
- `FR-ANN-003` MUST support underline and strikethrough annotations.
- `FR-ANN-004` MUST attach one or more notes to an annotation.
- `FR-ANN-005` MUST allow annotations to be edited and deleted.
- `FR-ANN-006` MUST support bookmarks for pages and selected passages.
- `FR-ANN-007` SHOULD support tags, labels, and priority.
- `FR-ANN-008` SHOULD provide undo/redo for recent local actions.

### Restoration
- `FR-RES-001` MUST persist source URL and selected quote.
- `FR-RES-002` MUST store prefix and suffix context when available.
- `FR-RES-003` MUST attempt quote-based restoration before DOM-path fallback.
- `FR-RES-004` MUST show an unresolved state instead of silently moving an annotation.
- `FR-RES-005` SHOULD store platform/thread/message identifiers when available.

### In-page experience
- `FR-UX-001` MUST provide a contextual floating toolbar.
- `FR-UX-002` MUST provide a collapsible side panel.
- `FR-UX-003` MUST preserve the user's reading position when opening the panel.
- `FR-UX-004` MUST allow editing notes without opening a new browser tab.
- `FR-UX-005` SHOULD provide keyboard shortcuts and a command palette.

### Knowledge graph
- `FR-GRAPH-001` MUST support editable nodes and edges.
- `FR-GRAPH-002` MUST store graph structure as data, not only as an image.
- `FR-GRAPH-003` MUST support node-to-source links.
- `FR-GRAPH-004` SHOULD support labels, edge direction, colours, and node types.
- `FR-GRAPH-005` SHOULD support undo/redo, zoom, pan, minimap, and export.

### Research management
- `FR-RESM-001` SHOULD support projects and source collections.
- `FR-RESM-002` SHOULD support manually entered paper metadata.
- `FR-RESM-003` SHOULD support evidence and literature comparison matrices.
- `FR-RESM-004` SHOULD support citation formatting templates.
- `FR-RESM-005` MAY support import from compatible reference formats later.

### Library and search
- `FR-LIB-001` MUST list documents, highlights, notes, bookmarks, and graphs.
- `FR-LIB-002` MUST provide text search over locally indexed user content.
- `FR-LIB-003` SHOULD support filters by source, date, type, tag, colour, and project.
- `FR-LIB-004` SHOULD support folders, collections, favourites, archive, and trash.

### Cross-device and offline
- `FR-SYNC-001` MUST save locally before cloud sync.
- `FR-SYNC-002` SHOULD synchronize through an authenticated cloud account.
- `FR-SYNC-003` MUST queue changes while offline.
- `FR-SYNC-004` MUST expose sync status and errors.
- `FR-SYNC-005` MUST provide export and restore independent of cloud availability.

### PWA
- `FR-PWA-001` MUST provide a responsive library and note editor.
- `FR-PWA-002` MUST allow users to view and edit synchronized annotations.
- `FR-PWA-003` SHOULD support a reader view for captured or accessible source content.
- `FR-PWA-004` SHOULD support share-to-app capture where the platform allows it.
- `FR-PWA-005` MUST clearly explain that it cannot overlay arbitrary native apps.

### Tasks
- `FR-TASK-001` SHOULD support tasks linked to notes, sources, projects, and graph nodes.
- `FR-TASK-002` SHOULD support status, priority, and due date.
- `FR-TASK-003` MAY support calendar and timeline views.

## 2.3 Non-functional requirements

| ID | Area | Requirement |
|---|---|---|
| `NFR-PERF-001` | Performance | Common annotation actions should feel immediate. |
| `NFR-PERF-002` | Performance | Large lists should use pagination or virtualization. |
| `NFR-REL-001` | Reliability | A page reload must not erase locally saved annotations. |
| `NFR-REL-002` | Reliability | Sync failure must not erase local edits. |
| `NFR-SEC-001` | Security | Cloud rows must be isolated by authenticated user. |
| `NFR-SEC-002` | Security | No service-role secret may be shipped to the client. |
| `NFR-PRIV-001` | Privacy | Store only data needed for product functionality. |
| `NFR-ACC-001` | Accessibility | Keyboard focus and visible focus indicators are required. |
| `NFR-ACC-002` | Accessibility | Text and controls must meet practical contrast targets. |
| `NFR-COMP-001` | Compatibility | Unsupported pages must fail gracefully. |
| `NFR-MAINT-001` | Maintainability | Site-specific selectors must live in adapters, not core logic. |

## 2.4 User stories

**US-01 — Save a highlight**  
As a reader, I select a passage, choose a colour, and see it saved immediately.

Acceptance:
- Highlight appears on the page.
- Annotation is saved locally.
- Sidebar count updates.
- A reload restores the highlight when the source anchor is still matchable.

**US-02 — Add a note**  
As a researcher, I attach a note to a highlight without leaving the source page.

Acceptance:
- Note editor opens beside the source.
- Text is autosaved locally.
- Note appears in the Notes panel.
- Clicking the note jumps to the source passage.

**US-03 — Connect evidence**  
As a researcher, I create a graph node from a highlight and connect it to another source.

Acceptance:
- Node stores a source reference.
- Edge is editable.
- Clicking the source reference opens the source and attempts to restore the passage.

**US-04 — Continue on mobile**  
As a user, I open the PWA and see the same synchronized notes and graph.

Acceptance:
- Authenticated data is scoped to the account.
- Pending sync is visible.
- Offline edits remain queued.

## 2.5 Out of scope

No AI summaries, AI assistant, LLM-based extraction, automatic AI tagging, or AI API integration in this release.
