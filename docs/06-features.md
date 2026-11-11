# 06 — Complete Feature Catalogue

This file is the master inventory. Feature IDs should be used in tasks, tests, and release notes.

## 6.1 Annotation engine

| ID | Feature | Priority |
|---|---|---|
| ANN-01 | Multi-colour text highlight | P0 |
| ANN-02 | Custom colour palette | P1 |
| ANN-03 | Underline | P0 |
| ANN-04 | Strikethrough | P0 |
| ANN-05 | Highlight edit/delete | P0 |
| ANN-06 | Undo/redo | P1 |
| ANN-07 | Note attached to selection | P0 |
| ANN-08 | Standalone note | P1 |
| ANN-09 | Sticky and margin notes | P2 |
| ANN-10 | Bookmark page/passage/message | P0 |
| ANN-11 | Tags and priority | P1 |
| ANN-12 | Screenshot/image annotation | P2 |
| ANN-13 | Table and code annotation | P2 |
| ANN-14 | Annotation history | P2 |
| ANN-15 | Bulk edit/archive/delete | P2 |

Acceptance baseline:
- A user can create, edit, and delete a highlight.
- The action is saved locally.
- The UI shows the correct state after reload.
- A failed render does not delete the canonical record.

## 6.2 Selection toolbar and contextual panel

| ID | Feature | Priority |
|---|---|---|
| UX-01 | Selection floating toolbar | P0 |
| UX-02 | Adaptive toolbar positioning | P0 |
| UX-03 | Collapsible side panel | P0 |
| UX-04 | Resize/pin sidebar | P1 |
| UX-05 | Notes/Highlights/Graph/Sources tabs | P0 |
| UX-06 | Jump to source passage | P0 |
| UX-07 | Preserve scroll position | P0 |
| UX-08 | Keyboard shortcuts | P1 |
| UX-09 | Command palette | P2 |
| UX-10 | Contextual quick actions | P1 |
| UX-11 | Compact and focus modes | P2 |

## 6.3 Text anchor and restoration

- Exact quote capture.
- Prefix/suffix capture.
- Text offsets.
- DOM path fallback.
- URL normalization.
- Conversation/thread identity.
- Message identity when available.
- Text fingerprint.
- Anchor confidence score.
- Re-anchoring after minor page changes.
- Orphaned annotation state.
- Manual reattach workflow.
- Multiple-match disambiguation.
- Restoration diagnostics.

## 6.4 Knowledge graph and diagram studio

- Mind map.
- Concept map.
- Knowledge graph.
- Flowchart.
- Timeline.
- Decision tree.
- Evidence map.
- Hierarchy diagram.
- Freeform canvas.
- Text, source, note, claim, evidence, question, image, and task nodes.
- Node create/edit/delete/duplicate.
- Node styling and grouping.
- Directed and undirected edges.
- Edge labels and relation types.
- Straight, curved, and orthogonal connectors.
- Zoom, pan, minimap, fit-to-screen.
- Grid and snap.
- Auto layout.
- Undo/redo.
- Multi-select and grouping.
- Search and filters.
- Graph templates.
- PNG/SVG/JSON/PDF export where supported.
- Source-linked node navigation.
- Orphan and disconnected-node diagnostics.

## 6.5 Research management

- Research projects.
- Research questions and objectives.
- Paper/article/book/report records.
- DOI, authors, publication date, journal, URL.
- Abstract and keyword fields entered by user.
- Method, findings, limitations, and personal notes.
- Evidence matrix.
- Literature comparison matrix.
- Research gap tracker.
- Hypothesis and methodology tracker.
- Claim/evidence relationships.
- Research timeline.
- APA, MLA, Chicago, Harvard, and IEEE citation templates.
- Bibliography export.

## 6.6 Long-form reading and PDF

- Reading progress and position.
- Table of contents extraction where possible.
- Heading navigator.
- Section bookmarks.
- Section notes.
- Highlight navigator.
- Annotation density overview.
- Focus mode.
- Reading timer and statistics.
- PDF rendering with PDF.js.
- PDF text selection and annotation where text layer permits.
- Page bookmarks.
- Page-specific notes.
- PDF search and zoom.
- Annotated PDF export only where technically supported.

## 6.7 Library and search

- Unified library.
- Documents, annotations, notes, bookmarks, graphs, tasks.
- Folders and collections.
- Tags.
- Favorites.
- Archive and Trash.
- Recent activity.
- Universal text search.
- Filters by source, date, type, tag, colour, project, platform.
- Search result preview and source jump.
- Saved searches.

## 6.8 Platform integration

Initial adapter targets:
- General webpages.
- ChatGPT web.
- DeepSeek web.
- Gemini web.
- Perplexity web.
- PDF viewer.

Adapter capabilities must be declared individually. A site may support generic text selection but not stable message-level identification.

## 6.9 Tasks and productivity

- Tasks and checklists.
- Due date and priority.
- Status.
- Task linked to source, note, graph node, or project.
- Daily/weekly notes.
- Follow-up tracker.
- Calendar/timeline view later.

## 6.10 Cross-device and mobile

- PWA installability.
- Responsive library.
- Notes and highlight editor.
- Graph viewing/editing.
- PDF reader.
- Offline access.
- Share-to-app capture.
- Local-first edits.
- Cloud sync.
- Sync status and conflict resolution.
- JSON backup/restore.

## 6.11 Settings and personalization

- Light, dark, system, dim, high-contrast themes.
- Optional warm paper/sepia themes.
- Font size.
- Accent colour.
- Highlight palette.
- Sidebar width and position.
- Keyboard shortcut configuration.
- Per-site enable/disable.
- Excluded elements/sites.
- Privacy and account controls.

## 6.12 Explicitly excluded

No AI summary, AI assistant, LLM-generated content, AI tagging, or AI API in this release.
