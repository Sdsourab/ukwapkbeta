# Known limitations (0.1.0)

The authoritative, numbered list is **docs/15-known-issues.md §15.X (KI-001 … KI-014)**. Summary:

**Not implemented:** PDF reading/highlighting; table of contents for long documents; sign-in UI for cloud sync; Firefox/Safari builds; a push-the-page sidebar mode; image nodes in graphs; per-site optional extension permissions.

**Implemented but never run in a real browser** (the authoring environment had none): highlight painting and the floating toolbar on real pages, sidebar layout, strict-CSP sites, PWA install/offline/share target, themes visually, graph-editor touch interactions, PNG export, the ChatGPT and DeepSeek adapters on the live sites.

**Needs external setup:** cloud sync (own Supabase project; SQL only syntax-checked).

**By design:**
- The extension and the PWA keep separate local databases (different browser origins); they meet through sync or JSON backup.
- Restoration is conservative: ambiguous or edited passages become "location lost" and need a manual **Reattach** rather than being guessed.
- Conflicts are last-writer-wins per record; note text is never lost (kept as a conflict copy).
- Undo history is in memory (100 steps) and does not survive a reload; deleted items stay in Trash.
- The extension asks for access to all http(s) pages so highlights can be restored automatically. It never records visits.

**Performance:** bundles are larger than ideal (PWA main chunk ~650 kB, content script ~385 kB). Measured guards: 300 loose restores on a 1.1 MB page ≈ 0.3 s; searching 5,000 annotations < 300 ms; importing 5,000 annotations < 15 s; laying out 500 nodes < 2 s (all asserted by tests, in Node/jsdom, not on a phone).
