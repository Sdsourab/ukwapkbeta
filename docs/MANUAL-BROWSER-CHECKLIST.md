# Manual browser checklist: run this before calling the product verified

Everything below is unverified in a real browser. Tick each box; record the browser/OS and any failure in `SESSION_LOG.md`.
Setup: `npm run build:extension`, load `apps/extension/dist` unpacked; serve the PWA with `npm run build:pwa && npx vite preview --config apps/pwa/vite.config.ts`.

## Extension: any article (try a news site and Wikipedia)
- [ ] Select a sentence → toolbar appears **above** the selection, never off-screen; clicking a colour highlights it; selection clears.
- [ ] The highlight colour is readable on light and dark pages; text stays legible.
- [ ] Underline, strikethrough and "highlight + note" work; the note box is focused.
- [ ] Reload the page: highlights return in the same places, with no flicker or scroll jump.
- [ ] Scroll with a selection active: the toolbar follows. Select across paragraphs and across bold/links.
- [ ] Click a highlight: the popover opens beside it; change colour; type a note; wait 1 s; reload: note persisted.
- [ ] Delete → toast with **Undo** → highlight returns. `Alt+H/S/N/B/K` work; none fire while typing in a page field.
- [ ] Sidebar: opens without moving the page; drag-resize; arrow-key resize; move left/right; each tab works; Escape closes.
- [ ] Right-click a selection → "Highlight selection" works. Toolbar popup shows the right count and buttons.
- [ ] Visit 5 pages without annotating, then open the library: **none** of them appear.
- [ ] Turn off on this site (popup or palette): highlights vanish; turn on again: they return without reload.

## Extension: hostile and unusual pages
- [ ] A strict-CSP site (e.g. github.com): highlights still draw; the toolbar and sidebar are styled.
- [ ] A page with its own `Ctrl+K`/`Alt` shortcuts: no clash. A page with iframes/shadow DOM: no errors.
- [ ] `chrome://extensions` and the Web Store: the popup says the page cannot be annotated.
- [ ] A very long page (≥ 50k words) with 100+ highlights: restoration finishes quickly, scrolling stays smooth.
- [ ] Edit the page text under a highlight (DevTools): it becomes "Location lost" and **Reattach** works.

## ChatGPT and DeepSeek (adapters are UNVERIFIED)
- [ ] ChatGPT thread: highlight inside an assistant message; reload; it restores in that message, not in a similar earlier one.
- [ ] Switch to another thread and back (SPA navigation): the right highlights show for each thread.
- [ ] The prompt box and buttons cannot be selected into a highlight.
- [ ] DeepSeek: thread identity works (same thread, same library entry); note any message-selector drift.

## PWA and graph editor
- [ ] Install from the browser; launch; go offline; relaunch: the app and your data load.
- [ ] Share a link from Android to the installed app: Quick capture opens pre-filled.
- [ ] Phone width: bottom navigation, no horizontal scrolling, 44 px tap targets.
- [ ] Graph editor on a touch device: pan, pinch-zoom, Multi-select mode, Connect mode, drag handles, inspector as a bottom sheet.
- [ ] Add, connect, group, ungroup, duplicate, delete, undo; auto-arrange; search; minimap; export JSON/SVG/**PNG** and re-import JSON.
- [ ] Open a source-linked node: goes to the right highlight.

## Themes and accessibility
- [ ] Light, Dark, System (change OS setting live), Dim, High contrast: every screen readable, focus ring visible, nothing white-on-white.
- [ ] Keyboard only: reach and operate the toolbar (Tab), sidebar, dialogs (focus trapped, Escape closes), palette.
- [ ] A screen reader announces toasts, dialog titles, tab selection and the sidebar's resize separator.

## Data safety
- [ ] Export a backup, delete all data, import: everything is back. Import a corrupted file: nothing changes and the message is clear.
- [ ] Trash: restore a deleted source with its highlights; permanently delete one.
