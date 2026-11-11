import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, EmptyState, Icon, IconButton, TextInput } from '@ukw/ui';
import { DEFAULT_HIGHLIGHT_COLOUR, isHexColour, type AnnotationRecord, type SearchResult } from '@ukw/domain';
import { graphToSvg } from '@ukw/graph-engine';
import type { ControllerState, PageController } from '../controller';
import { NoteField } from './Popover';

type Tab = 'highlights' | 'notes' | 'graph' | 'sources';
const MIN_W = 280;
const MAX_W = 720;

function AnnotationCard({ controller, a, state, onGraph }: { controller: PageController; a: AnnotationRecord; state: ControllerState; onGraph: () => void }) {
  const info = state.restore[a.id];
  const lost = a.anchor && (a.status === 'orphaned' || (info && info.status !== 'matched'));
  const note = (state.notesByAnnotation[a.id] ?? [])[0];
  const colour = isHexColour(a.colour) ? a.colour : DEFAULT_HIGHLIGHT_COLOUR;
  const [edit, setEdit] = useState(!!note);
  return (
    <article className={`ukw-card${state.activeId === a.id ? ' is-active' : ''}${lost ? ' is-lost' : ''}`} style={{ ['--hl' as string]: colour }}>
      <div className="ukw-card__quote" role="button" tabIndex={0} onClick={() => controller.jumpTo(a.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); controller.jumpTo(a.id); } }}>
        {a.anchor ? <>“{a.anchor.exact.length > 280 ? a.anchor.exact.slice(0, 279) + '…' : a.anchor.exact}”</> : <strong><Icon name="bookmark" size={14} /> {a.label || 'Bookmark'}</strong>}
      </div>
      <div className="ukw-card__meta">
        <span className="badge">{a.type}</span>
        {lost ? <span className="badge badge--warn">{info?.status === 'ambiguous' ? `${info.candidates} possible places` : 'Location lost'}</span> : null}
        {a.isFavorite ? <span className="badge badge--accent">Favorite</span> : null}
      </div>
      {lost ? <div><Button size="sm" onClick={() => void controller.reattach(a.id)}>{state.reattachId === a.id ? 'Reattach to selection' : 'Reattach…'}</Button></div> : null}
      {edit || note ? <NoteField controller={controller} annotationId={a.id} noteId={note?.id} initial={note?.body ?? ''} rows={2} autoFocus={!note && edit} /> : null}
      <div className="ukw-row">
        {!edit && !note ? <IconButton size="sm" icon="note" label="Add note" onClick={() => setEdit(true)} /> : null}
        <IconButton size="sm" icon="graph" label="Add to graph" onClick={onGraph} />
        <IconButton size="sm" icon="star" label={a.isFavorite ? 'Remove favorite' : 'Favorite'} active={a.isFavorite} onClick={() => void controller.updateAnnotation(a.id, { isFavorite: !a.isFavorite })} />
        <span className="grow" />
        <IconButton size="sm" icon="trash" label="Delete" onClick={() => void controller.deleteAnnotation(a.id)} />
      </div>
    </article>
  );
}

function HighlightsTab({ controller, state, onGraph }: { controller: PageController; state: ControllerState; onGraph: (id: string) => void }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return state.annotations.filter((a) => a.status !== 'archived').filter((a) => !t || `${a.anchor?.exact ?? ''} ${a.label ?? ''} ${(state.notesByAnnotation[a.id] ?? []).map((n) => n.body).join(' ')}`.toLowerCase().includes(t));
  }, [state.annotations, state.notesByAnnotation, q]);
  if (state.annotations.length === 0) return <EmptyState icon="highlight" title="No highlights on this page">Select any text to highlight it, or press <kbd className="ukw-kbd">{state.settings.shortcuts.highlight}</kbd>.</EmptyState>;
  return (
    <>
      <TextInput aria-label="Filter highlights" type="search" placeholder="Filter highlights and notes" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
      {list.length === 0 ? <p className="muted">Nothing matches.</p> : list.map((a) => <AnnotationCard key={a.id} controller={controller} a={a} state={state} onGraph={() => onGraph(a.id)} />)}
    </>
  );
}

function NotesTab({ controller, state }: { controller: PageController; state: ControllerState }) {
  const [draft, setDraft] = useState('');
  return (
    <>
      <div style={{ display: 'grid', gap: 6 }}>
        <textarea className="ukw-input ukw-textarea" aria-label="New note about this page" rows={3} placeholder="Write a note about this whole page…" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
        <div><Button variant="primary" size="sm" disabled={!draft.trim()} onClick={async () => { const n = await controller.createPageNote(draft); if (n) setDraft(''); }}>Save note</Button></div>
      </div>
      {state.pageNotes.map((n) => <div key={n.id} className="ukw-card"><NoteField controller={controller} noteId={n.id} initial={n.body} rows={3} /></div>)}
      {state.pageNotes.length === 0 ? <p className="muted">Notes about the page as a whole appear here. Notes on a highlight live with the highlight.</p> : null}
    </>
  );
}

function GraphTab({ controller, state, preferred }: { controller: PageController; state: ControllerState; preferred: string | null }) {
  const [graphs, setGraphs] = useState<Array<{ id: string; title: string }>>([]);
  const [sel, setSel] = useState<string>('');
  const [svg, setSvg] = useState('');
  const [label, setLabel] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => { void controller.listGraphs().then((g) => { setGraphs(g); setSel((cur) => cur || preferred || g[0]?.id || ''); }).catch(() => undefined); }, [controller, tick, preferred]);
  useEffect(() => {
    if (!sel) { setSvg(''); return; }
    let cancelled = false;
    void controller.loadGraph(sel).then(({ graph, nodes, edges }) => { if (!cancelled) setSvg(graphToSvg(graph.title, nodes, edges, { background: '#ffffff' })); }).catch(() => { if (!cancelled) setSvg(''); });
    return () => { cancelled = true; };
  }, [controller, sel, tick, state.annotations.length]);
  return (
    <>
      <div className="ukw-row">
        <select aria-label="Graph" className="ukw-input" style={{ flex: 1, width: 'auto' }} value={sel} onChange={(e) => setSel(e.target.value)}>
          {graphs.length === 0 ? <option value="">No graphs yet</option> : null}
          {graphs.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        <IconButton icon="plus" label="New graph" onClick={async () => { const id = await controller.createGraph(); if (id) { setSel(id); setTick((t) => t + 1); } }} />
      </div>
      {sel ? (
        <>
          {/* graphToSvg escapes all text and validates colours (covered by tests); it emits no scripts or external references. */}
          <div className="ukw-svgbox" role="img" aria-label="Graph preview" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="ukw-row">
            <TextInput aria-label="New idea" placeholder="Add an idea…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={async (e) => { e.stopPropagation(); if (e.key === 'Enter' && label.trim() && (await controller.addGraphNode(sel, label.trim()))) { setLabel(''); setTick((t) => t + 1); } }} />
            <Button size="sm" disabled={!label.trim()} onClick={async () => { if (await controller.addGraphNode(sel, label.trim())) { setLabel(''); setTick((t) => t + 1); } }}>Add</Button>
          </div>
          <Button icon="graph" onClick={() => void controller.openDashboard(`/graphs/${sel}`)}>Open full editor</Button>
          <p className="muted">Tip: use the graph button on any highlight to add it as a source-linked node.</p>
        </>
      ) : <EmptyState icon="graph" title="Start a graph">Connect ideas from this page. Create a graph, then add highlights to it.</EmptyState>}
    </>
  );
}

function SourcesTab({ controller, state }: { controller: PageController; state: ControllerState }) {
  const [recent, setRecent] = useState<SearchResult[]>([]);
  useEffect(() => { void controller.search('').then((r) => setRecent(r.filter((x) => x.entityType === 'document').slice(0, 6))).catch(() => undefined); }, [controller, state.document?.id]);
  const d = state.document;
  return (
    <>
      <div className="ukw-card" style={{ ['--hl' as string]: 'var(--ukw-accent)' }}>
        <strong style={{ overflowWrap: 'anywhere' }}>{d?.title || state.identity.title || document.title || location.hostname}</strong>
        <span className="muted" style={{ overflowWrap: 'anywhere', fontSize: '.82rem' }}>{state.identity.url}</span>
        <div className="ukw-card__meta">
          {state.identity.platform ? <span className="badge">{state.identity.platform}</span> : null}
          <span className="badge">{d ? 'In your library' : 'Not saved yet'}</span>
        </div>
        <div className="kv"><div><b>{state.annotations.length}</b>annotations</div><div><b>{state.pageNotes.length}</b>page notes</div></div>
        {!d ? <p className="muted">This page is added to your library when you first highlight or add a note. Visiting a page records nothing.</p> : <Button icon="file" onClick={() => void controller.openDashboard(`/doc/${d.id}`)}>Open in library</Button>}
      </div>
      <h3 style={{ fontSize: '.95rem' }}>Recent sources</h3>
      {recent.length === 0 ? <p className="muted">Nothing else saved yet.</p> : recent.map((r) => (
        <button key={r.entityId} type="button" className="ukw-btn" style={{ justifyContent: 'flex-start', textAlign: 'left' }} onClick={() => void controller.openDashboard(`/doc/${r.entityId}`)}>{r.title.slice(0, 70)}</button>
      ))}
    </>
  );
}

export function Sidebar({ controller, state, onGraph, preferredGraph }: { controller: PageController; state: ControllerState; onGraph: (annotationId: string) => void; preferredGraph: string | null }) {
  const [tab, setTab] = useState<Tab>('highlights');
  const [width, setWidth] = useState(state.settings.sidebarWidth);
  const drag = useRef<{ x: number; w: number } | null>(null);
  const side = state.settings.sidebarSide;
  useEffect(() => setWidth(state.settings.sidebarWidth), [state.settings.sidebarWidth]);

  const onDown = (e: React.PointerEvent) => { drag.current = { x: e.clientX, w: width }; (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x;
    setWidth(Math.max(MIN_W, Math.min(MAX_W, drag.current.w + (side === 'right' ? -dx : dx))));
  };
  const onUp = () => { if (drag.current) { drag.current = null; void controller.updateSetting('sidebarWidth', width); } };
  const nudge = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 16;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const grow = (e.key === 'ArrowLeft') === (side === 'right');
      const next = Math.max(MIN_W, Math.min(MAX_W, width + (grow ? step : -step)));
      setWidth(next);
      void controller.updateSetting('sidebarWidth', next);
    }
  };

  const count = state.annotations.filter((a) => a.status !== 'archived').length;
  return (
    <aside className={`ukw-side ${side}`} style={{ width }} aria-label="Workspace sidebar" onKeyDown={(e) => { if (e.key === 'Escape') controller.toggleSidebar(false); e.stopPropagation(); }}>
      <div className="ukw-side__grip" role="separator" aria-orientation="vertical" aria-label="Resize sidebar (arrow keys)" aria-valuenow={width} aria-valuemin={MIN_W} aria-valuemax={MAX_W} tabIndex={0} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onKeyDown={nudge} />
      <div className="ukw-side__head">
        <h2>{state.document?.title || state.identity.title || 'This page'}</h2>
        <IconButton size="sm" icon="pin" label={state.settings.sidebarPinned ? 'Unpin (do not reopen on other pages)' : 'Pin (reopen on other pages)'} active={state.settings.sidebarPinned} onClick={() => void controller.updateSetting('sidebarPinned', !state.settings.sidebarPinned)} />
        <IconButton size="sm" icon={side === 'right' ? 'chevron-left' : 'chevron-right'} label={`Move to the ${side === 'right' ? 'left' : 'right'}`} onClick={() => void controller.updateSetting('sidebarSide', side === 'right' ? 'left' : 'right')} />
        <IconButton size="sm" icon="x" label="Close sidebar" onClick={() => controller.toggleSidebar(false)} />
      </div>
      <div className="tabs" role="tablist">
        {([['highlights', `Highlights${count ? ` (${count})` : ''}`], ['notes', `Notes${state.pageNotes.length ? ` (${state.pageNotes.length})` : ''}`], ['graph', 'Graph'], ['sources', 'Sources']] as const).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      <div className="ukw-side__body">
        {state.error ? <p role="alert" style={{ color: 'var(--ukw-danger)' }}>{state.error}</p> : null}
        {tab === 'highlights' ? <HighlightsTab controller={controller} state={state} onGraph={onGraph} />
          : tab === 'notes' ? <NotesTab controller={controller} state={state} />
          : tab === 'graph' ? <GraphTab controller={controller} state={state} preferred={preferredGraph} />
          : <SourcesTab controller={controller} state={state} />}
      </div>
      <div className="ukw-side__foot">
        <IconButton size="sm" icon="undo" label="Undo" onClick={() => void controller.undo()} />
        <IconButton size="sm" icon="redo" label="Redo" onClick={() => void controller.redo()} />
        <span className="grow" style={{ flex: 1 }} />
        <Button size="sm" variant="ghost" icon="library" onClick={() => void controller.openDashboard('/')}>Library</Button>
      </div>
    </aside>
  );
}
