import { buildTextMap, captureFromRange, restoreInMap, UI_ATTRIBUTE, type TextMap } from '@ukw/anchor-engine';
import {
  DEFAULT_SETTINGS,
  UkwError,
  isContentCommand,
  type AnnotationRecord,
  type AnnotationType,
  type ContentCommand,
  type DocumentRecord,
  type NoteRecord,
  type TextAnchor,
  type UkwSettings,
} from '@ukw/domain';
import type { PlatformAdapter, PageIdentity } from './adapters';
import type { Client } from './client';
import type { HighlightRenderer, PaintEntry } from './highlighter';
import { isEditableTarget, matchesShortcut, parseShortcut } from './keys';

export interface PageSelection {
  anchor: TextAnchor;
  rect: { top: number; left: number; width: number; height: number; bottom: number; right: number };
  text: string;
}

export interface RestoreInfo {
  status: 'matched' | 'ambiguous' | 'orphaned';
  candidates: number;
}

export interface ControllerState {
  ready: boolean;
  disabled: boolean;
  unsupported: boolean;
  identity: PageIdentity;
  document: DocumentRecord | null;
  annotations: AnnotationRecord[];
  notesByAnnotation: Record<string, NoteRecord[]>;
  pageNotes: NoteRecord[];
  restore: Record<string, RestoreInfo>;
  settings: UkwSettings;
  selection: PageSelection | null;
  activeId: string | null;
  focusNote: boolean;
  sidebarOpen: boolean;
  paletteOpen: boolean;
  /** Set while the user is choosing the passage to reattach an orphaned annotation to. */
  reattachId: string | null;
  error: string | null;
}

export interface Notice {
  message: string;
  kind?: 'info' | 'success' | 'error';
  action?: { label: string; run: () => void };
}

export interface ControllerDeps {
  doc: Document;
  win: Window & typeof globalThis;
  client: Client;
  adapterFor: (url: URL) => PlatformAdapter;
  renderer: HighlightRenderer;
}

const ANCHORED: AnnotationType[] = ['highlight', 'underline', 'strike'];
const elementOf = (n: Node): Element | null => (n.nodeType === 1 ? (n as Element) : n.parentElement);

/**
 * Per-page orchestration: lookup → restore → paint, selection → anchor → create, and keeping everything
 * in sync with the background store. Framework-free so it can be tested in jsdom.
 * The page is never modified except through the renderer; browsing is never recorded (lookups are read-only).
 */
export class PageController {
  private state: ControllerState;
  private listeners = new Set<() => void>();
  private noticeListeners = new Set<(n: Notice) => void>();
  private entries = new Map<string, Range>();
  private globalMapCache: TextMap | null = null;
  private lastUrl: string;
  private timers: Array<ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>> = [];
  private observer: MutationObserver | null = null;
  private cleanup: Array<() => void> = [];
  private started = false;
  private activated = false;
  private selectionRange: Range | null = null;
  private selTimer: ReturnType<typeof setTimeout> | undefined;
  private scrollRaf = 0;
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;

  constructor(private readonly deps: ControllerDeps) {
    this.lastUrl = deps.win.location.href;
    this.state = {
      ready: false, disabled: false, unsupported: false,
      identity: this.identify(),
      document: null, annotations: [], notesByAnnotation: {}, pageNotes: [], restore: {},
      settings: DEFAULT_SETTINGS, selection: null, activeId: null, focusNote: false,
      sidebarOpen: false, paletteOpen: false, reattachId: null, error: null,
    };
  }

  /* ------------------------------------------------------------- state plumbing */

  getState = (): ControllerState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  onNotice(l: (n: Notice) => void): () => void {
    this.noticeListeners.add(l);
    return () => this.noticeListeners.delete(l);
  }

  private set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  private notify(n: Notice): void {
    for (const l of [...this.noticeListeners]) l(n);
  }

  private get adapter(): PlatformAdapter {
    return this.deps.adapterFor(new URL(this.deps.win.location.href));
  }

  private identify(): PageIdentity {
    const url = new URL(this.deps.win.location.href);
    return this.deps.adapterFor(url).identify(url, this.deps.doc);
  }

  private fail(err: unknown, fallback: string): void {
    const message = err instanceof UkwError ? err.message : fallback;
    this.set({ error: message });
    this.notify({ message, kind: 'error' });
  }

  /* ------------------------------------------------------------- lifecycle */

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      const settings = (await this.deps.client.request('SETTINGS_GET', {})) as UkwSettings;
      this.set({ settings: { ...DEFAULT_SETTINGS, ...settings } });
    } catch (err) {
      this.fail(err, 'Could not load settings.');
    }
    if (this.state.settings.disabledSites.includes(this.deps.win.location.hostname)) {
      this.set({ disabled: true, ready: true });
      return; // listeners are attached later if the user turns the site back on
    }
    this.attachListeners();
    await this.refresh();
    if (this.state.settings.sidebarPinned && this.state.settings.sidebarOpen) this.set({ sidebarOpen: true });
    this.set({ ready: true });
  }

  /** Idempotent: wires DOM listeners, the mutation observer and the SPA URL poll. */
  private attachListeners(): void {
    if (this.activated) return;
    this.activated = true;
    const { win, doc } = this.deps;
    const on = <K extends keyof DocumentEventMap>(t: K, h: (e: DocumentEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      doc.addEventListener(t, h, opts);
      this.cleanup.push(() => doc.removeEventListener(t, h, opts));
    };
    on('selectionchange', () => { clearTimeout(this.selTimer); this.selTimer = setTimeout(() => this.updateSelection(), 90); });
    on('mouseup', () => { clearTimeout(this.selTimer); this.selTimer = setTimeout(() => this.updateSelection(), 0); });
    on('click', (e) => this.handleClick(e), { capture: true });
    on('keydown', (e) => this.handleKey(e), { capture: true });
    // Scrolling only moves the toolbar: re-read the live range's rectangle, never re-capture the anchor.
    const onScroll = () => {
      if (!this.selectionRange || this.scrollRaf) return;
      this.scrollRaf = win.requestAnimationFrame(() => { this.scrollRaf = 0; this.updateSelectionRect(); });
    };
    win.addEventListener('scroll', onScroll, { passive: true, capture: true });
    this.cleanup.push(() => win.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions));

    this.observer = new win.MutationObserver((muts) => {
      if (muts.every((m) => { const el = elementOf(m.target); return !!el?.closest(`[${UI_ATTRIBUTE}]`); })) return;
      this.globalMapCache = null; // never reuse text nodes from before the change
      this.scheduleReRestore();
    });
    this.observer.observe(doc.body ?? doc.documentElement, { childList: true, subtree: true, characterData: true });
    this.timers.push(setInterval(() => void this.checkUrl(), 1000));
  }

  destroy(): void {
    this.cleanup.forEach((f) => f());
    this.cleanup = [];
    this.timers.forEach((t) => { clearTimeout(t as never); clearInterval(t as never); });
    this.timers = [];
    this.observer?.disconnect();
    clearTimeout(this.selTimer);
    clearTimeout(this.reRestoreTimer);
    clearTimeout(this.changedTimer);
    if (this.scrollRaf) this.deps.win.cancelAnimationFrame?.(this.scrollRaf);
    this.scrollRaf = 0;
    this.selectionRange = null;
    this.globalMapCache = null;
    this.deps.renderer.destroy();
    this.listeners.clear();
    this.noticeListeners.clear();
    this.started = false;
    this.activated = false;
  }

  /* ------------------------------------------------------------- loading and restoring */

  /** Re-reads this page's annotations from the store and repaints. Coalesces overlapping calls. */
  refresh(): Promise<void> {
    if (this.refreshing) { this.refreshAgain = true; return this.refreshing; }
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        await this.doRefresh();
      } while (this.refreshAgain);
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  private async doRefresh(): Promise<void> {
    const identity = this.identify();
    try {
      const [settingsRaw, r] = await Promise.all([
        this.deps.client.request('SETTINGS_GET', {}),
        this.deps.client.request('DOCUMENT_LOOKUP', { url: identity.url, platform: identity.platform, externalId: identity.externalId }),
      ]);
      const settings = { ...DEFAULT_SETTINGS, ...(settingsRaw as UkwSettings) };
      const off = settings.disabledSites.includes(this.deps.win.location.hostname);
      if (off) {
        this.deps.renderer.clear();
        this.set({ settings, disabled: true, selection: null, sidebarOpen: false, paletteOpen: false, ready: true });
        return;
      }
      if (this.state.disabled) this.attachListeners(); // the user turned this site back on
      this.globalMapCache = null;
      this.set({ settings, disabled: false, identity, document: r.document, annotations: r.annotations, notesByAnnotation: r.notesByAnnotation, pageNotes: r.pageNotes, unsupported: r.unsupported, error: null });
      this.restoreAll();
    } catch (err) {
      this.fail(err, 'Could not load your annotations for this page.');
    }
  }

  private globalMap(): TextMap {
    if (!this.globalMapCache) this.globalMapCache = buildTextMap(this.adapter.root(this.deps.doc), { skip: this.adapter.skip });
    return this.globalMapCache;
  }

  private restoreAll(): void {
    const { doc } = this.deps;
    const adapter = this.adapter;
    const msgMaps = new Map<string, TextMap | null>();
    const messageMap = (id: string): TextMap | null => {
      if (!msgMaps.has(id)) {
        const el = adapter.findMessage(doc, id);
        msgMaps.set(id, el ? buildTextMap(el, { skip: adapter.skip }) : null);
      }
      return msgMaps.get(id)!;
    };

    const paint: PaintEntry[] = [];
    const info: Record<string, RestoreInfo> = {};
    const reports: Array<Promise<unknown>> = [];
    this.entries.clear();

    for (const a of this.state.annotations) {
      if (a.status === 'archived' || !a.anchor || !ANCHORED.includes(a.type)) continue;
      let res = null as ReturnType<typeof restoreInMap> | null;
      if (a.anchor.messageId) {
        const m = messageMap(a.anchor.messageId);
        if (m) { const r = restoreInMap(m, a.anchor); if (r.result.status === 'matched' && r.range) res = r; }
      }
      res ??= restoreInMap(this.globalMap(), a.anchor);

      if (res.result.status === 'matched' && res.range) {
        paint.push({ id: a.id, type: a.type as PaintEntry['type'], colour: a.colour ?? this.state.settings.defaultColour, range: res.range });
        this.entries.set(a.id, res.range);
        info[a.id] = { status: 'matched', candidates: 1 };
        const strategy = res.result.match.strategy;
        if (a.status !== 'active' || a.anchor.strategy !== strategy) reports.push(this.deps.client.request('ANCHOR_REPORT', { annotationId: a.id, status: 'active', confidence: res.result.match.score, strategy }));
      } else {
        info[a.id] = { status: res.result.status === 'matched' ? 'orphaned' : res.result.status, candidates: res.result.candidates.length };
        if (a.status !== 'orphaned') reports.push(this.deps.client.request('ANCHOR_REPORT', { annotationId: a.id, status: 'orphaned' }));
      }
    }
    this.deps.renderer.paint(paint);
    this.set({ restore: info });
    // Reporting is bookkeeping: failures must not disturb reading.
    void Promise.allSettled(reports);
  }

  private reRestoreTimer: ReturnType<typeof setTimeout> | undefined;
  private scheduleReRestore(): void {
    clearTimeout(this.reRestoreTimer);
    this.reRestoreTimer = setTimeout(() => {
      this.globalMapCache = null;
      const needs = this.state.annotations.some((a) => {
        if (a.status === 'archived' || !a.anchor || !ANCHORED.includes(a.type)) return false;
        const r = this.entries.get(a.id);
        return !r || !r.startContainer.isConnected || !r.endContainer.isConnected || r.collapsed;
      });
      if (needs) this.restoreAll();
    }, 700);
    this.timers.push(this.reRestoreTimer);
  }

  /** SPA navigation: when the URL changes, look up the new page and clear stale UI state. */
  async checkUrl(): Promise<void> {
    const href = this.deps.win.location.href;
    if (href === this.lastUrl) return;
    this.lastUrl = href;
    this.set({ selection: null, activeId: null, reattachId: null, focusNote: false });
    await this.refresh();
  }

  /* ------------------------------------------------------------- selection */

  private updateSelection(): void {
    if (!this.started) return;
    const next = this.captureSelection();
    const cur = this.state.selection;
    if (!next) this.selectionRange = null;
    if (!next && !cur) return;
    if (next && cur && cur.anchor.exact === next.anchor.exact && cur.anchor.startOffset === next.anchor.startOffset && cur.rect.top === next.rect.top && cur.rect.left === next.rect.left) return;
    this.set({ selection: next });
  }

  /** Cheap toolbar-follow-scroll update: same anchor, new rectangle. */
  private updateSelectionRect(): void {
    const cur = this.state.selection;
    if (!this.started || !cur || !this.selectionRange) return;
    const r = this.selectionRange.getBoundingClientRect();
    if (r.top === cur.rect.top && r.left === cur.rect.left) return;
    this.set({ selection: { ...cur, rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right } } });
  }

  private captureSelection(): PageSelection | null {
    const { win, doc } = this.deps;
    if (this.state.disabled) return null;
    const sel = win.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const adapter = this.adapter;
    const root = adapter.root(doc);
    if (!root.contains(range.commonAncestorContainer)) return null;
    const startEl = elementOf(range.startContainer);
    const endEl = elementOf(range.endContainer);
    if (startEl?.closest(`[${UI_ATTRIBUTE}]`) || endEl?.closest(`[${UI_ATTRIBUTE}]`)) return null;
    if (isEditableTarget(startEl) || startEl?.closest('[contenteditable="true"],[role="textbox"],input,textarea')) return null;

    // Always map the CURRENT DOM: the page may have changed since the last restore, and an anchor built
    // from stale text nodes would store the wrong quote/offsets.
    let anchor: TextAnchor | null = null;
    const a = adapter.messageOf(range.startContainer);
    const b = adapter.messageOf(range.endContainer);
    if (a && b && a.id === b.id) anchor = captureFromRange(buildTextMap(a.el, { skip: adapter.skip }), range, { messageId: a.id });
    anchor ??= captureFromRange(buildTextMap(root, { skip: adapter.skip }), range);
    if (!anchor) return null;
    this.selectionRange = range.cloneRange();
    const r = range.getBoundingClientRect();
    return { anchor, text: anchor.exact, rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right } };
  }

  clearSelection(): void {
    this.deps.win.getSelection()?.removeAllRanges();
    this.selectionRange = null;
    if (this.state.selection) this.set({ selection: null });
  }

  /* ------------------------------------------------------------- creating and editing */

  async createFromSelection(type: AnnotationType = 'highlight', colour?: string, opts: { editNote?: boolean } = {}): Promise<AnnotationRecord | null> {
    this.updateSelection();
    const sel = this.state.selection;
    if (!sel) { this.notify({ message: 'Select some text first.', kind: 'info' }); return null; }
    try {
      const res = await this.deps.client.request('ANNOTATION_CREATE', { page: this.identify(), type, colour: colour ?? this.state.settings.defaultColour, anchor: sel.anchor });
      this.clearSelection();
      await this.refresh();
      if (opts.editNote) this.setActive(res.annotation.id, true);
      this.notify({ message: type === 'highlight' ? 'Highlight saved' : type === 'underline' ? 'Underline saved' : 'Strikethrough saved', kind: 'success', action: { label: 'Undo', run: () => void this.undo() } });
      return res.annotation as AnnotationRecord;
    } catch (err) {
      this.fail(err, 'Could not save the highlight.');
      return null;
    }
  }

  /** Page-level bookmark (no text needed): remembers the scroll position and nearest heading. */
  async createBookmark(label?: string): Promise<AnnotationRecord | null> {
    const { win, doc } = this.deps;
    const max = doc.documentElement.scrollHeight - win.innerHeight;
    const scrollRatio = max > 0 ? Math.min(1, Math.max(0, win.scrollY / max)) : 0;
    try {
      const res = await this.deps.client.request('ANNOTATION_CREATE', { page: this.identify(), type: 'bookmark', anchor: null, label: (label ?? doc.title ?? 'Bookmark').slice(0, 300) || 'Bookmark', location: { scrollRatio } });
      await this.refresh();
      this.notify({ message: 'Bookmark saved', kind: 'success', action: { label: 'Undo', run: () => void this.undo() } });
      return res.annotation as AnnotationRecord;
    } catch (err) {
      this.fail(err, 'Could not save the bookmark.');
      return null;
    }
  }

  async createPageNote(body: string): Promise<NoteRecord | null> {
    if (!body.trim()) return null;
    try {
      const res = await this.deps.client.request('PAGE_NOTE_CREATE', { page: this.identify(), body });
      await this.refresh();
      return res.note as NoteRecord;
    } catch (err) {
      this.fail(err, 'Could not save the note.');
      return null;
    }
  }

  async updateAnnotation(id: string, patch: { colour?: string; type?: 'highlight' | 'underline' | 'strike'; isFavorite?: boolean; status?: 'active' | 'orphaned' | 'archived' }): Promise<void> {
    try { await this.deps.client.request('ANNOTATION_UPDATE', { id, patch }); await this.refresh(); } catch (err) { this.fail(err, 'Could not update the annotation.'); }
  }

  async deleteAnnotation(id: string): Promise<void> {
    try {
      await this.deps.client.request('ANNOTATION_DELETE', { id });
      if (this.state.activeId === id) this.set({ activeId: null });
      await this.refresh();
      this.notify({ message: 'Annotation deleted', action: { label: 'Undo', run: () => void this.undo() } });
    } catch (err) { this.fail(err, 'Could not delete the annotation.'); }
  }

  /** Autosave target for note editors. An emptied note is removed. Returns the saved note id. */
  async saveNote(annotationId: string | undefined, body: string, noteId?: string): Promise<string | undefined> {
    const documentId = this.state.document?.id;
    if (!documentId) return undefined;
    try {
      if (!body.trim()) { if (noteId) await this.deps.client.request('NOTE_DELETE', { id: noteId }); return undefined; }
      const n = await this.deps.client.request('NOTE_SAVE', { id: noteId, documentId, annotationId, body, format: 'markdown' });
      return (n as NoteRecord).id;
    } catch (err) { this.fail(err, 'Could not save the note.'); return noteId; }
  }

  /* ------------------------------------------------------------- graphs, search, dashboard (thin wrappers over messages) */

  listGraphs(): Promise<Array<{ id: string; title: string; kind: string; updatedAt: string }>> {
    return this.deps.client.request('GRAPH_LIST', {});
  }
  loadGraph(graphId: string) {
    return this.deps.client.request('GRAPH_LOAD', { graphId }) as Promise<{ graph: { id: string; title: string }; nodes: import('@ukw/domain').GraphNodeRecord[]; edges: import('@ukw/domain').GraphEdgeRecord[] }>;
  }
  async createGraph(title?: string): Promise<string | null> {
    try { const g = await this.deps.client.request('GRAPH_CREATE', { title }); return (g as { id: string }).id; } catch (err) { this.fail(err, 'Could not create the graph.'); return null; }
  }
  async addGraphNode(graphId: string, label: string): Promise<boolean> {
    try { await this.deps.client.request('GRAPH_ADD_NODE', { graphId, label }); return true; } catch (err) { this.fail(err, 'Could not add the node.'); return false; }
  }
  async addToGraph(annotationId: string, graphId: string): Promise<boolean> {
    try {
      await this.deps.client.request('GRAPH_ADD_NODE_FROM_ANNOTATION', { annotationId, graphId });
      this.notify({ message: 'Added to graph', kind: 'success', action: { label: 'Open', run: () => void this.openDashboard(`/graphs/${graphId}`) } });
      return true;
    } catch (err) { this.fail(err, 'Could not add to the graph.'); return false; }
  }
  async openDashboard(path = '/'): Promise<void> {
    try { await this.deps.client.request('OPEN_DASHBOARD', { path }); } catch (err) { this.fail(err, 'Could not open the library.'); }
  }
  search(query: string) {
    return this.deps.client.request('SEARCH', { query, limit: 8 }) as Promise<import('@ukw/domain').SearchResult[]>;
  }

  async undo(): Promise<void> {
    try { const r = await this.deps.client.request('HISTORY_UNDO', {}); this.notify({ message: r.label ? `Undid: ${r.label}` : 'Nothing to undo' }); await this.refresh(); } catch (err) { this.fail(err, 'Undo failed.'); }
  }
  async redo(): Promise<void> {
    try { const r = await this.deps.client.request('HISTORY_REDO', {}); this.notify({ message: r.label ? `Redid: ${r.label}` : 'Nothing to redo' }); await this.refresh(); } catch (err) { this.fail(err, 'Redo failed.'); }
  }

  cancelReattach(): void {
    if (this.state.reattachId) this.set({ reattachId: null });
  }

  /** Starts (or completes) reattachment of an orphaned annotation to the current selection. */
  async reattach(id: string): Promise<void> {
    this.updateSelection();
    const sel = this.state.selection;
    if (!sel) { this.set({ reattachId: id }); this.notify({ message: 'Select the right passage on the page, then press Reattach again.' }); return; }
    try {
      await this.deps.client.request('ANNOTATION_UPDATE', { id, patch: { anchor: { ...sel.anchor, confidence: 1, strategy: 'manual' }, status: 'active' } });
      this.set({ reattachId: null });
      this.clearSelection();
      await this.refresh();
      this.notify({ message: 'Annotation reattached', kind: 'success' });
    } catch (err) { this.fail(err, 'Could not reattach the annotation.'); }
  }

  /* ------------------------------------------------------------- UI state */

  setActive(id: string | null, focusNote = false): void {
    this.set({ activeId: id, focusNote });
  }

  toggleSidebar(open?: boolean): void {
    const next = open ?? !this.state.sidebarOpen;
    this.set({ sidebarOpen: next });
    if (this.state.settings.sidebarPinned) void this.deps.client.request('SETTINGS_UPDATE', { key: 'sidebarOpen', value: next }).catch(() => undefined);
  }

  togglePalette(open?: boolean): void {
    this.set({ paletteOpen: open ?? !this.state.paletteOpen });
  }

  async updateSetting<K extends keyof UkwSettings>(key: K, value: UkwSettings[K]): Promise<void> {
    this.set({ settings: { ...this.state.settings, [key]: value } });
    try { await this.deps.client.request('SETTINGS_UPDATE', { key, value }); } catch (err) { this.fail(err, 'Could not save that setting.'); }
  }

  async disableOnThisSite(): Promise<void> {
    const host = this.deps.win.location.hostname;
    const list = [...new Set([...this.state.settings.disabledSites, host])];
    await this.updateSetting('disabledSites', list);
    this.deps.renderer.clear();
    this.set({ disabled: true, selection: null, sidebarOpen: false, paletteOpen: false });
    this.notify({ message: `Turned off on ${host}. Re-enable it in the library settings.` });
  }

  /** Scrolls the page to an annotation (highlight range, or bookmark scroll position). */
  jumpTo(id: string): void {
    const { win, doc } = this.deps;
    const reduced = this.state.settings.reducedMotion || win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const behavior: ScrollBehavior = reduced ? 'auto' : 'smooth';
    const range = this.entries.get(id);
    this.set({ activeId: id });
    if (range) {
      const r = range.getBoundingClientRect();
      win.scrollTo({ top: Math.max(0, r.top + win.scrollY - win.innerHeight / 3), behavior });
      return;
    }
    const a = this.state.annotations.find((x) => x.id === id);
    const ratio = a?.location?.scrollRatio;
    if (ratio !== undefined) win.scrollTo({ top: ratio * Math.max(0, doc.documentElement.scrollHeight - win.innerHeight), behavior });
  }

  rectOf(id: string): DOMRect | null {
    return this.entries.get(id)?.getBoundingClientRect() ?? null;
  }

  /* ------------------------------------------------------------- input */

  handleClick(e: MouseEvent): void {
    if (this.state.disabled) return;
    const target = e.target as Element | null;
    if (target?.closest?.(`[${UI_ATTRIBUTE}]`)) return;
    if (this.deps.win.getSelection()?.isCollapsed === false) return; // user is selecting, not clicking
    const id = this.deps.renderer.hitTest(e.clientX, e.clientY);
    if (id) this.setActive(id);
    else if (this.state.activeId) this.setActive(null);
  }

  handleKey(e: KeyboardEvent): void {
    if (this.state.disabled || e.defaultPrevented) return;
    const s = this.state.settings.shortcuts;
    const inPageField = isEditableTarget(e.target) && !(e.target as Element).closest?.(`[${UI_ATTRIBUTE}]`);
    if (e.key === 'Escape') {
      if (this.state.paletteOpen) { this.togglePalette(false); return; }
      if (this.state.activeId) { this.setActive(null); return; }
    }
    if (inPageField) return;
    const match = (spec: string) => { const p = parseShortcut(spec); return !!p && matchesShortcut(e, p); };
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    if (match(s.extensionPalette)) { stop(); this.togglePalette(); }
    else if (match(s.toggleSidebar)) { stop(); this.toggleSidebar(); }
    else if (match(s.highlight)) { stop(); void this.createFromSelection('highlight'); }
    else if (match(s.note)) { stop(); if (this.state.selection) void this.createFromSelection('highlight', undefined, { editNote: true }); else this.toggleSidebar(true); }
    else if (match(s.bookmark)) { stop(); void this.createBookmark(); }
  }

  /** Commands from the background (keyboard commands, context menu, popup). */
  handleRuntimeMessage(raw: unknown): unknown {
    if (isContentCommand(raw)) {
      const c: ContentCommand = raw.command;
      if (c === 'get-status') return { annotations: this.state.annotations.length, orphaned: Object.values(this.state.restore).filter((r) => r.status !== 'matched').length, sidebarOpen: this.state.sidebarOpen, disabled: this.state.disabled, hostname: this.deps.win.location.hostname, supported: !this.state.unsupported };
      if (this.state.disabled && c !== 'refresh') return undefined;
      if (c === 'toggle-sidebar') this.toggleSidebar();
      else if (c === 'highlight-selection') void this.createFromSelection('highlight');
      else if (c === 'add-note') { if (this.state.selection) void this.createFromSelection('highlight', undefined, { editNote: true }); else this.toggleSidebar(true); }
      else if (c === 'add-bookmark') void this.createBookmark();
      else if (c === 'open-palette') this.togglePalette(true);
      else if (c === 'refresh') void this.refresh();
      return undefined;
    }
    if (typeof raw === 'object' && raw && (raw as { ukw?: string }).ukw === 'changed') {
      clearTimeout(this.changedTimer);
      this.changedTimer = setTimeout(() => void this.refresh(), 120);
      this.timers.push(this.changedTimer);
    }
    return undefined;
  }
  private changedTimer: ReturnType<typeof setTimeout> | undefined;
}
