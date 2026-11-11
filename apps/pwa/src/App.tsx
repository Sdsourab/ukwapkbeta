import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Icon, IconButton, Spinner, ToastProvider, applyTheme, resolveTheme, useToast, watchSystemTheme, THEMES, type IconName } from '@ukw/ui';
import type { SearchResult, ThemeMode } from '@ukw/domain';
import { THEME_MODES } from '@ukw/domain';
import { CommandPalette, type Command } from './components/CommandPalette';
import { QuickCapture } from './components/QuickCapture';
import { useSettings, useStore, useStoreQuery } from './store-context';
import { dateStamp, downloadBlob } from './lib/download';
import { registerServiceWorker } from './lib/pwa';
import { Library } from './screens/Library';
import { DocumentView } from './screens/DocumentView';
import { SearchScreen } from './screens/Search';
import { Organize } from './screens/Organize';
import { GraphList } from './screens/GraphList';
import { Research } from './screens/Research';
import { SettingsScreen } from './screens/Settings';
import { ShareTarget } from './screens/ShareTarget';

const GraphEditor = lazy(() => import('./screens/GraphEditor'));

const NAV: Array<{ to: string; label: string; icon: IconName; end?: boolean; desktopOnly?: boolean }> = [
  { to: '/', label: 'Library', icon: 'library', end: true },
  { to: '/search', label: 'Search', icon: 'search' },
  { to: '/graphs', label: 'Graphs', icon: 'graph' },
  { to: '/research', label: 'Research', icon: 'flask' },
  { to: '/organize', label: 'Organize', icon: 'folder', desktopOnly: true },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

const TITLES: Array<[RegExp, string]> = [
  [/^\/search/, 'Search'], [/^\/graphs\/.+/, 'Graph'], [/^\/graphs/, 'Graphs'], [/^\/research/, 'Research'],
  [/^\/organize/, 'Organize'], [/^\/settings/, 'Settings'], [/^\/doc\//, 'Source'], [/^\/share/, 'Save shared item'], [/^\//, 'Library'],
];

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

function Shell() {
  const store = useStore();
  const settings = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);

  // Theme application (document root) + system theme tracking.
  useEffect(() => {
    const apply = () => {
      const resolved = applyTheme(document.documentElement, settings.theme, { accent: settings.accent, fontScale: settings.fontScale, reducedMotion: settings.reducedMotion });
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEMES[resolved].bg);
    };
    apply();
    return settings.theme === 'system' ? watchSystemTheme(apply) : undefined;
  }, [settings.theme, settings.accent, settings.fontScale, settings.reducedMotion]);

  // Service worker updates.
  useEffect(() => {
    registerServiceWorker((apply) => toast({ message: 'A new version is ready.', actionLabel: 'Reload', onAction: apply, duration: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Undo/redo state, refreshed on every change event.
  const hist = useStoreQuery(async (s) => ({ canUndo: s.canUndo(), canRedo: s.canRedo(), undo: s.ctx.peekUndoLabel(), redo: s.ctx.peekRedoLabel(), pending: await s.pendingSyncCount() }), []);
  const h = hist.data ?? { canUndo: false, canRedo: false, undo: undefined, redo: undefined, pending: 0 };

  const doUndo = useCallback(async () => { const l = await store.undo(); if (l) toast({ message: `Undid: ${l}`, actionLabel: 'Redo', onAction: () => void store.redo() }); else toast({ message: 'Nothing to undo' }); }, [store, toast]);
  const doRedo = useCallback(async () => { const l = await store.redo(); if (l) toast({ message: `Redid: ${l}` }); else toast({ message: 'Nothing to redo' }); }, [store, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); return; }
      if (isTyping(e.target)) return;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); void (e.shiftKey ? doRedo() : doUndo()); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); void doRedo(); }
      else if (!mod && !e.altKey && e.key === '/') { e.preventDefault(); navigate('/search'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [doUndo, doRedo, navigate]);

  const setTheme = useCallback((m: ThemeMode) => store.settings.set('theme', m), [store]);

  const commands: Command[] = useMemo(() => [
    ...NAV.map((n): Command => ({ id: `go-${n.to}`, title: `Go to ${n.label}`, group: 'Navigate', icon: n.icon, run: () => navigate(n.to) })),
    { id: 'capture', title: 'Quick capture…', group: 'Create', icon: 'plus', hint: 'note or link', run: () => setCaptureOpen(true) },
    { id: 'new-graph', title: 'New graph', group: 'Create', icon: 'graph', run: async () => { const g = await store.graphs.createGraph({}); navigate(`/graphs/${g.id}`); } },
    { id: 'new-project', title: 'New research project', group: 'Create', icon: 'flask', run: () => navigate('/research?new=1') },
    { id: 'undo', title: 'Undo', group: 'Edit', icon: 'undo', hint: h.undo, run: doUndo },
    { id: 'redo', title: 'Redo', group: 'Edit', icon: 'redo', hint: h.redo, run: doRedo },
    ...THEME_MODES.map((m): Command => ({ id: `theme-${m}`, title: `Theme: ${m.replace('-', ' ')}`, group: 'Appearance', icon: m === 'light' ? 'sun' : 'moon', keywords: 'appearance mode dark light dim contrast system', run: () => setTheme(m) })),
    { id: 'backup', title: 'Export full backup (JSON)', group: 'Data', icon: 'download', run: async () => { downloadBlob(JSON.stringify(await store.exportBackup(), null, 2), `ukw-backup-${dateStamp()}.json`, 'application/json'); toast({ message: 'Backup downloaded', kind: 'success' }); } },
  ], [navigate, store, h.undo, h.redo, doUndo, doRedo, setTheme, toast]);

  const openResult = useCallback((r: SearchResult) => {
    if (r.entityType === 'graph') navigate(`/graphs/${r.entityId}`);
    else if (r.entityType === 'node' && r.graphId) navigate(`/graphs/${r.graphId}?node=${r.entityId}`);
    else if (r.entityType === 'document') navigate(`/doc/${r.entityId}`);
    else if (r.entityType === 'project') navigate(`/research/${r.entityId}`);
    else if (r.documentId) navigate(`/doc/${r.documentId}?focus=${r.entityId}`);
    else navigate('/search?q=' + encodeURIComponent(r.title));
  }, [navigate]);

  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? 'Workspace';
  const fullBleed = /^\/graphs\/.+/.test(location.pathname);

  return (
    <div className="app">
      <a className="skip" href="#main">Skip to content</a>
      <nav className="nav" aria-label="Primary">
        <div className="nav__brand"><img src="icons/icon-192.png" alt="" /></div>
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `nav__link${isActive ? ' is-active' : ''}${n.desktopOnly ? ' nav__link--desktop' : ''}`}>
            <Icon name={n.icon} size={22} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="main">
        <header className="topbar">
          <div className="topbar__title" role="heading" aria-level={1}>{title}</div>
          <NavLink to="/settings" className="syncpill" title="Your data is saved on this device. Cloud sync is not configured.">
            <Icon name="cloud" size={14} /><span>{h.pending > 0 ? `Local · ${h.pending} queued` : 'Local only'}</span>
          </NavLink>
          <IconButton icon="undo" label={h.undo ? `Undo ${h.undo}` : 'Undo'} disabled={!h.canUndo} onClick={() => void doUndo()} />
          <IconButton icon="redo" label={h.redo ? `Redo ${h.redo}` : 'Redo'} disabled={!h.canRedo} onClick={() => void doRedo()} />
          <IconButton icon="command" label="Command palette (Ctrl/Cmd+K)" onClick={() => setPaletteOpen(true)} />
        </header>
        <main id="main" className={`page${fullBleed ? ' page--full' : ''}`} tabIndex={-1}>
          <Suspense fallback={<div style={{ display: 'grid', placeItems: 'center', padding: 60 }}><Spinner size={28} /></div>}>
            <Routes>
              <Route path="/" element={<Library />} />
              <Route path="/doc/:id" element={<DocumentView />} />
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/graphs" element={<GraphList />} />
              <Route path="/graphs/:id" element={<GraphEditor />} />
              <Route path="/organize" element={<Organize />} />
              <Route path="/research" element={<Research />} />
              <Route path="/research/:id" element={<Research />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/share" element={<ShareTarget />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      {!fullBleed ? <button className="fab" onClick={() => setCaptureOpen(true)} aria-label="Quick capture"><Icon name="plus" size={26} /></button> : null}
      <QuickCapture open={captureOpen} onClose={() => setCaptureOpen(false)} />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} onOpenResult={openResult} />
    </div>
  );
}

export function App() {
  return (
    <ToastProvider>
      <Shell />
    </ToastProvider>
  );
}

export { resolveTheme };
