# 11 — Testing Strategy

## 11.1 Testing layers

1. Unit tests — pure functions, validators, anchor scoring, reducers.
2. Component tests — toolbar, sidebar, note editor, graph controls.
3. Integration tests — database writes, repository operations, sync queue.
4. Browser tests — selection, rendering, restoration, navigation.
5. End-to-end tests — complete user workflows.
6. Security tests — RLS, authorization, import validation.
7. Manual compatibility tests — real sites and browser versions.

## 11.2 Critical annotation test cases

| Test ID | Scenario | Expected result |
|---|---|---|
| TC-ANN-01 | Select a sentence and highlight | Highlight appears and saves |
| TC-ANN-02 | Reload page | Highlight restores if anchor matches |
| TC-ANN-03 | Edit highlight colour | New colour persists |
| TC-ANN-04 | Attach note | Note remains linked to annotation |
| TC-ANN-05 | Delete annotation | UI removes it; recoverability follows policy |
| TC-ANN-06 | Same quote appears twice | Context disambiguates or asks user |
| TC-ANN-07 | Source text changes | Annotation becomes unresolved/orphaned if unsafe |
| TC-ANN-08 | User goes offline | Local save still succeeds |
| TC-ANN-09 | Long page | No full-page rescan on every small mutation |
| TC-ANN-10 | Sidebar open/close | Reading position remains stable |

## 11.3 Anchor restoration test fixtures

Create controlled HTML fixtures for:
- Unchanged article.
- Extra paragraph inserted above selection.
- Whitespace changes.
- Punctuation changes.
- Duplicate quote.
- Deleted quote.
- Reordered content.
- Dynamic content loaded later.
- Virtualized message list.
- Nested formatting inside a sentence.

Record restoration outcome and confidence. A wrong restoration is more serious than an unresolved restoration.

## 11.4 Graph tests

- Create node.
- Move and resize node.
- Create edge between valid nodes.
- Reject edge with missing endpoint.
- Delete node and connected edges.
- Undo and redo.
- Export and re-import.
- Preserve source references.
- Handle large graph without blocking the UI.

## 11.5 Sync tests

- Local edit while online.
- Local edit while offline.
- Reconnect and synchronize.
- Same note edited on two devices.
- Node moved on two devices.
- Deletion while another device is offline.
- Expired authentication.
- Network interruption during batch.
- Duplicate operation delivery.
- Server quota/limit response.

## 11.6 Security tests

- User A cannot read User B's record.
- User A cannot update User B's record.
- Invalid owner ID is rejected.
- Import payload cannot inject executable content.
- HTML note content is sanitized before rendering.
- Extension message from an untrusted page is rejected.
- No privileged key exists in built client assets.

## 11.7 Performance checks

Measure:
- Time to open toolbar.
- Time to save locally.
- Time to render annotations on a page.
- Search response time for a realistic library.
- Graph interaction responsiveness.
- Memory use on long documents.
- PWA cold start and offline start.

Use realistic test datasets rather than only tiny examples.

## 11.8 Manual release checklist

- [ ] Fresh install works.
- [ ] Permissions are minimal and explained.
- [ ] Highlight and note survive reload.
- [ ] Sidebar does not break page layout.
- [ ] Keyboard navigation works.
- [ ] Light/dark/system themes work.
- [ ] Offline editing works.
- [ ] Backup exports and restores.
- [ ] Sync errors are visible.
- [ ] Mobile layout is usable.
- [ ] Unsupported pages fail gracefully.
- [ ] No AI feature or API is accidentally included.
