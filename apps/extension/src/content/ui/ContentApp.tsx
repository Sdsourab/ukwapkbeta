import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Dialog, Button, PaletteView, ToastProvider, applyTheme, watchSystemTheme, useToast, type PaletteCommand, type PaletteResult } from '@ukw/ui';
import type { PageController } from '../controller';
import { Popover } from './Popover';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';

function NoticeBridge({ controller }: { controller: PageController }) {
  const toast = useToast();
  useEffect(() => controller.onNotice((n) => toast({ message: n.message, kind: n.kind, actionLabel: n.action?.label, onAction: n.action?.run })), [controller, toast]);
  return null;
}

function GraphPicker({ controller, annotationId, onClose, onPicked }: { controller: PageController; annotationId: string; onClose: () => void; onPicked: (graphId: string) => void }) {
  const [graphs, setGraphs] = useState<Array<{ id: string; title: string }> | null>(null);
  useEffect(() => { void controller.listGraphs().then(setGraphs).catch(() => setGraphs([])); }, [controller]);
  const add = async (id: string) => { if (await controller.addToGraph(annotationId, id)) { onPicked(id); onClose(); } };
  return (
    <Dialog open title="Add to graph" onClose={onClose} footer={<Button icon="plus" onClick={async () => { const id = await controller.createGraph(); if (id) await add(id); }}>New graph</Button>}>
      {graphs === null ? <p className="muted">Loading…</p> : graphs.length === 0 ? <p className="muted">No graphs yet. Create one to start connecting ideas.</p> : (
        <div style={{ display: 'grid', gap: 8 }}>{graphs.map((g) => <Button key={g.id} onClick={() => void add(g.id)} style={{ justifyContent: 'flex-start' }}>{g.title}</Button>)}</div>
      )}
    </Dialog>
  );
}

function Inner({ controller }: { controller: PageController }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getState);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [graphFor, setGraphFor] = useState<string | null>(null);
  const [lastGraph, setLastGraph] = useState<string | null>(null);
  const [results, setResults] = useState<PaletteResult[]>([]);
  const queryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { theme, accent, fontScale, reducedMotion } = state.settings;
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const apply = () => applyTheme(el, theme, { accent, fontScale, reducedMotion });
    apply();
    return theme === 'system' ? watchSystemTheme(apply) : undefined;
  }, [theme, accent, fontScale, reducedMotion]);

  const commands: PaletteCommand[] = useMemo(() => [
    { id: 'sidebar', title: state.sidebarOpen ? 'Close sidebar' : 'Open sidebar', group: 'View', icon: 'sidebar', hint: state.settings.shortcuts.toggleSidebar, run: () => controller.toggleSidebar() },
    { id: 'hl', title: 'Highlight selection', group: 'Annotate', icon: 'highlight', hint: state.settings.shortcuts.highlight, keywords: 'mark', run: () => void controller.createFromSelection('highlight') },
    { id: 'ul', title: 'Underline selection', group: 'Annotate', icon: 'underline', run: () => void controller.createFromSelection('underline') },
    { id: 'st', title: 'Strike through selection', group: 'Annotate', icon: 'strike', run: () => void controller.createFromSelection('strike') },
    { id: 'note', title: 'Highlight selection and add a note', group: 'Annotate', icon: 'note', hint: state.settings.shortcuts.note, run: () => void controller.createFromSelection('highlight', undefined, { editNote: true }) },
    { id: 'bm', title: 'Bookmark this spot', group: 'Annotate', icon: 'bookmark', hint: state.settings.shortcuts.bookmark, run: () => void controller.createBookmark() },
    { id: 'undo', title: 'Undo', group: 'Edit', icon: 'undo', run: () => void controller.undo() },
    { id: 'redo', title: 'Redo', group: 'Edit', icon: 'redo', run: () => void controller.redo() },
    { id: 'lib', title: 'Open library', group: 'Go to', icon: 'library', run: () => void controller.openDashboard('/') },
    { id: 'graphs', title: 'Open graphs', group: 'Go to', icon: 'graph', run: () => void controller.openDashboard('/graphs') },
    { id: 'settings', title: 'Open settings', group: 'Go to', icon: 'settings', run: () => void controller.openDashboard('/settings') },
    { id: 'off', title: `Turn off on ${location.hostname}`, group: 'This site', icon: 'eye', run: () => void controller.disableOnThisSite() },
  ], [controller, state.sidebarOpen, state.settings.shortcuts]);

  const onQuery = (q: string) => {
    clearTimeout(queryTimer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    queryTimer.current = setTimeout(() => {
      void controller.search(q).then((r) => setResults(r.map((x): PaletteResult => ({
        key: `r-${x.entityType}-${x.entityId}`, title: x.title.slice(0, 90) || 'Untitled', hint: x.entityType,
        icon: x.entityType === 'graph' || x.entityType === 'node' ? 'graph' : x.entityType === 'note' ? 'note' : x.entityType === 'document' ? 'file' : 'highlight',
        run: () => void controller.openDashboard(x.entityType === 'graph' ? `/graphs/${x.entityId}` : x.entityType === 'document' ? `/doc/${x.entityId}` : x.documentId ? `/doc/${x.documentId}?focus=${x.entityId}` : '/search'),
      })))).catch(() => setResults([]));
    }, 150);
  };

  const showLauncher = !state.sidebarOpen && !state.disabled && state.annotations.length > 0;
  return (
    <div ref={wrapRef} className="ukw-root ukw-host">
      <NoticeBridge controller={controller} />
      <Toolbar controller={controller} state={state} />
      <Popover controller={controller} state={state} onGraph={setGraphFor} />
      {state.sidebarOpen ? <Sidebar controller={controller} state={state} onGraph={setGraphFor} preferredGraph={lastGraph} /> : null}
      {showLauncher ? (
        <button type="button" className={`ukw-launcher ${state.settings.sidebarSide}`} aria-label={`Open workspace sidebar (${state.annotations.length} annotations)`} title="Open workspace sidebar" onClick={() => controller.toggleSidebar(true)}>
          <span>{state.annotations.length}</span>
        </button>
      ) : null}
      {state.reattachId ? (
        <div className="ukw-banner" role="status">
          <span>Select the correct passage on the page, then press Reattach.</span>
          <Button size="sm" onClick={() => controller.cancelReattach()}>Cancel</Button>
        </div>
      ) : null}
      {graphFor ? <GraphPicker controller={controller} annotationId={graphFor} onClose={() => setGraphFor(null)} onPicked={setLastGraph} /> : null}
      <PaletteView open={state.paletteOpen} onClose={() => controller.togglePalette(false)} commands={commands} results={results} onQueryChange={onQuery} />
    </div>
  );
}

export function ContentApp({ controller }: { controller: PageController }) {
  return (
    <ToastProvider>
      <Inner controller={controller} />
    </ToastProvider>
  );
}
