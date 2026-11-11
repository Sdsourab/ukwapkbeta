import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Background, BackgroundVariant, ConnectionMode, Controls, MarkerType, MiniMap, ReactFlow, ReactFlowProvider, SelectionMode, applyNodeChanges, useReactFlow, type Edge, type NodeChange, type OnNodeDrag } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Button, Dialog, EmptyState, ErrorState, Field, Icon, IconButton, Segmented, Skeleton, Switch, TextArea, TextInput, useDebouncedCallback, useToast } from '@ukw/ui';
import { graphToSvg, type LayoutKind } from '@ukw/graph-engine';
import { UkwError, isHexColour, type GraphEdgeRecord, type GraphKind, type GraphNodeRecord, type GraphNodeType, type NodeShape, type SearchResult } from '@ukw/domain';
import { FloatingEdge, UkwNode, type UkwFlowNode } from '../graph/elements';
import { dateStamp, downloadBlob, safeFilename, svgToPngBlob } from '../lib/download';
import { plural } from '../lib/format';
import { useSettings, useStore, useStoreQuery } from '../store-context';

const nodeTypes = { ukw: UkwNode };
const edgeTypes = { ukw: FloatingEdge };
const NODE_TYPES: Array<{ value: GraphNodeType; label: string }> = [{ value: 'text', label: 'Idea' }, { value: 'claim', label: 'Claim' }, { value: 'evidence', label: 'Evidence' }, { value: 'question', label: 'Question' }, { value: 'note', label: 'Note' }, { value: 'source', label: 'Source' }, { value: 'task', label: 'Task' }];
const SHAPES: NodeShape[] = ['rounded', 'rect', 'pill', 'ellipse', 'diamond'];
const KINDS: GraphKind[] = ['knowledge', 'mindmap', 'concept', 'flowchart', 'timeline', 'decision', 'evidence', 'hierarchy', 'freeform'];
type Mode = 'pan' | 'select' | 'connect';

/** Text field that commits after a pause, on blur and on unmount (autosave without losing edits). */
function AutoField({ value, onCommit, multiline, label, rows = 3 }: { value: string; onCommit: (v: string) => void; multiline?: boolean; label: string; rows?: number }) {
  const [v, setV] = useState(value);
  const last = useRef(value);
  useEffect(() => { if (value !== last.current) { setV(value); last.current = value; } }, [value]);
  const { call, flush } = useDebouncedCallback((x: string) => { if (x !== last.current) { last.current = x; onCommit(x); } }, 450);
  const common = { 'aria-label': label, value: v, onChange: (e: { target: { value: string } }) => { setV(e.target.value); call(e.target.value); }, onBlur: flush };
  return multiline ? <TextArea rows={rows} {...common} /> : <TextInput {...common} />;
}

function SourcePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (r: SearchResult) => void }) {
  const store = useStore();
  const [q, setQ] = useState('');
  const res = useStoreQuery((s) => s.search.search({ query: q, types: ['annotation', 'note', 'document'], limit: 40 }), [q]);
  return (
    <Dialog open={open} onClose={onClose} title="Add from your sources" wide>
      <TextInput aria-label="Search sources" type="search" placeholder="Search highlights, notes and sources…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {(res.data ?? []).length === 0 ? <EmptyState icon="highlight" title="Nothing to add yet">Highlights, notes and sources you save appear here.</EmptyState> : (
        <div className="rows" style={{ maxHeight: 360, overflow: 'auto' }}>
          {res.data!.map((r) => (
            <button key={`${r.entityType}-${r.entityId}`} type="button" className="card" style={{ textAlign: 'left', padding: 12, cursor: 'pointer', display: 'grid', gap: 2 }} onClick={() => onPick(r)}>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{r.colour ? <span className="dot" style={{ background: r.colour }} /> : null}<strong style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title.slice(0, 120)}</strong><span className="badge">{r.entityType}</span></span>
            </button>
          ))}
        </div>
      )}
      {void store}
    </Dialog>
  );
}

function Editor({ graphId }: { graphId: string }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const rf = useReactFlow();
  const q = useStoreQuery((s) => s.graphs.load(graphId), [graphId], ['graphs', 'nodes', 'edges', 'annotations', 'documents']);
  const [nodes, setNodes] = useState<UkwFlowNode[]>([]);
  const [selNodes, setSelNodes] = useState<string[]>([]);
  const [selEdges, setSelEdges] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('pan');
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [minimap, setMinimap] = useState(true);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const dragging = useRef(false);
  const dragStart = useRef(new Map<string, { x: number; y: number }>());
  const firstFit = useRef(true);
  const handledFocus = useRef<string | null>(null);

  const loaded = q.data;
  const matchIds = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t || !loaded) return [] as string[];
    return loaded.nodes.filter((n) => `${n.label} ${n.body ?? ''}`.toLowerCase().includes(t)).map((n) => n.id);
  }, [search, loaded]);
  const matchSet = useMemo(() => new Set(matchIds), [matchIds]);
  const [matchIdx, setMatchIdx] = useState(0);

  // Sync DB → canvas (skipped mid-drag so the node under the finger never jumps).
  useEffect(() => {
    if (!loaded || dragging.current) return;
    const selected = new Set(selNodes);
    setNodes(loaded.nodes.map((rec): UkwFlowNode => ({
      id: rec.id, type: 'ukw', position: rec.position, selected: selected.has(rec.id), zIndex: rec.type === 'group' ? -1 : 0,
      data: { rec, match: matchSet.has(rec.id) },
      ...(rec.dimensions && (rec.type === 'group' || rec.dimensions) ? { width: rec.dimensions.width, height: rec.dimensions.height, style: { width: rec.dimensions.width, height: rec.dimensions.height } } : {}),
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, matchSet]);

  const edges: Edge[] = useMemo(() => (loaded?.edges ?? []).map((e: GraphEdgeRecord) => {
    const colour = isHexColour(e.colour) ? e.colour : undefined;
    return {
      id: e.id, source: e.sourceNodeId, target: e.targetNodeId, type: 'ukw', label: e.label, selected: selEdges.includes(e.id),
      data: { connector: e.connector },
      markerEnd: e.directed ? { type: MarkerType.ArrowClosed, color: colour ?? undefined, width: 18, height: 18 } : undefined,
      style: colour ? { stroke: colour } : undefined,
    };
  }), [loaded?.edges, selEdges]);

  // Focus a node from ?node= (search results, "Open graph" toasts).
  useEffect(() => {
    const target = params.get('node');
    if (!target || !loaded || handledFocus.current === target || nodes.length === 0) return;
    const rec = loaded.nodes.find((n) => n.id === target);
    handledFocus.current = target;
    if (rec) { setSelNodes([target]); setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === target }))); setTimeout(() => void rf.fitView({ nodes: [{ id: target }], maxZoom: 1.2, duration: settings.reducedMotion ? 0 : 400 }), 50); }
    const next = new URLSearchParams(params); next.delete('node'); setParams(next, { replace: true });
  }, [params, loaded, nodes.length, rf, setParams, settings.reducedMotion]);

  const { call: saveViewport } = useDebouncedCallback((vp: { x: number; y: number; zoom: number }) => { void store.graphs.setViewport(graphId, vp); }, 800);

  const fail = useCallback((err: unknown, fallback: string) => toast({ message: err instanceof UkwError ? err.message : fallback, kind: 'error' }), [toast]);
  const centerPos = useCallback(() => {
    const el = document.querySelector('.gcanvas');
    const r = el?.getBoundingClientRect();
    const p = rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 });
    return { x: Math.round(p.x - 90), y: Math.round(p.y - 32) };
  }, [rf]);

  const addNode = useCallback(async (type: GraphNodeType = 'text', at?: { x: number; y: number }) => {
    try {
      const jitter = loaded?.nodes.length ? (loaded.nodes.length % 5) * 14 : 0;
      const base = at ?? centerPos();
      const n = await store.graphs.addNode(graphId, { type, label: type === 'text' ? 'New idea' : NODE_TYPES.find((t) => t.value === type)?.label ?? 'Node', position: { x: base.x + jitter, y: base.y + jitter }, shape: type === 'question' ? 'diamond' : 'rounded' });
      setSelNodes([n.id]); setSelEdges([]);
      setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { id: n.id, type: 'ukw', position: n.position, selected: true, data: { rec: n, match: false } } as UkwFlowNode]);
    } catch (e) { fail(e, 'Could not add the node'); }
  }, [store, graphId, loaded?.nodes.length, centerPos, fail]);

  const onNodesChange = useCallback((changes: NodeChange<UkwFlowNode>[]) => setNodes((ns) => applyNodeChanges(changes, ns)), []);

  const onDragStart: OnNodeDrag<UkwFlowNode> = useCallback((_, __, all) => {
    dragging.current = true;
    dragStart.current = new Map(all.map((n) => [n.id, { ...n.position }]));
    for (const n of loaded?.nodes ?? []) if (!dragStart.current.has(n.id)) dragStart.current.set(n.id, { ...n.position });
  }, [loaded?.nodes]);

  const onDrag: OnNodeDrag<UkwFlowNode> = useCallback((_, node) => {
    if (node.data.rec.type !== 'group') return;
    const s = dragStart.current.get(node.id);
    if (!s) return;
    const dx = node.position.x - s.x, dy = node.position.y - s.y;
    setNodes((ns) => ns.map((n) => (n.data.rec.groupId === node.id ? { ...n, position: { x: (dragStart.current.get(n.id)?.x ?? n.position.x) + dx, y: (dragStart.current.get(n.id)?.y ?? n.position.y) + dy } } : n)));
  }, []);

  const onDragStop: OnNodeDrag<UkwFlowNode> = useCallback((_, node, all) => {
    const moves = new Map(all.map((n) => [n.id, n.position]));
    if (node.data.rec.type === 'group') {
      const s = dragStart.current.get(node.id);
      if (s) { const dx = node.position.x - s.x, dy = node.position.y - s.y; for (const m of loaded?.nodes ?? []) if (m.groupId === node.id) { const o = dragStart.current.get(m.id) ?? m.position; moves.set(m.id, { x: o.x + dx, y: o.y + dy }); } }
    }
    dragging.current = false;
    void store.graphs.moveNodes([...moves].map(([id, position]) => ({ id, position }))).catch((e) => fail(e, 'Could not save the new position'));
  }, [store, loaded?.nodes, fail]);

  const connect = useCallback(async (source: string, target: string) => {
    try { await store.graphs.addEdge(graphId, { sourceNodeId: source, targetNodeId: target }); }
    catch (e) { fail(e, 'Could not connect those nodes'); }
  }, [store, graphId, fail]);

  const removeSelection = useCallback(async (nodeIds: string[], edgeIds: string[]) => {
    try {
      await store.batch('Delete from graph', async () => { if (nodeIds.length) await store.graphs.removeNodes(nodeIds); if (edgeIds.length) await store.graphs.removeEdges(edgeIds); });
      setSelNodes([]); setSelEdges([]);
      toast({ message: `Deleted ${[nodeIds.length && plural(nodeIds.length, 'node'), edgeIds.length && plural(edgeIds.length, 'connection')].filter(Boolean).join(' and ')}`, actionLabel: 'Undo', onAction: () => void store.undo() });
    } catch (e) { fail(e, 'Could not delete'); }
  }, [store, toast, fail]);

  const onNodeClick = useCallback((_: unknown, node: UkwFlowNode) => {
    if (mode === 'connect') {
      if (!connectFrom) { setConnectFrom(node.id); toast({ message: 'Now tap the node to connect to', duration: 3000 }); }
      else if (connectFrom !== node.id) { void connect(connectFrom, node.id); setConnectFrom(null); }
      else setConnectFrom(null);
    } else if (mode === 'select') {
      setSelNodes((cur) => { const set = new Set(cur); if (set.has(node.id)) set.delete(node.id); else set.add(node.id); setNodes((ns) => ns.map((n) => ({ ...n, selected: set.has(n.id) }))); return [...set]; });
    }
  }, [mode, connectFrom, connect, toast]);

  const runLayout = async (kind: LayoutKind) => {
    setLayoutOpen(false);
    try { await store.graphs.applyAutoLayout(graphId, { kind }); setTimeout(() => void rf.fitView({ padding: 0.2, duration: settings.reducedMotion ? 0 : 400 }), 80); toast({ message: 'Layout applied', actionLabel: 'Undo', onAction: () => void store.undo() }); }
    catch (e) { fail(e, 'Could not arrange the graph'); }
  };

  const doExport = async (kind: 'json' | 'svg' | 'png') => {
    if (!loaded) return;
    setExportOpen(false);
    try {
      const name = loaded.graph.title;
      if (kind === 'json') downloadBlob(JSON.stringify(await store.graphs.exportGraph(graphId), null, 2), safeFilename(name, 'json'), 'application/json');
      else {
        const svg = graphToSvg(name, loaded.nodes, loaded.edges, { background: '#ffffff' });
        if (kind === 'svg') downloadBlob(svg, safeFilename(name, 'svg'), 'image/svg+xml');
        else downloadBlob(await svgToPngBlob(svg), safeFilename(name, 'png'), 'image/png');
      }
      toast({ message: `Exported ${kind.toUpperCase()}`, kind: 'success' });
    } catch (e) { fail(e, 'Export failed'); }
  };

  const stepMatch = (dir: 1 | -1) => {
    if (!matchIds.length) return;
    const i = (matchIdx + dir + matchIds.length) % matchIds.length;
    setMatchIdx(i);
    const id = matchIds[i]!;
    setSelNodes([id]);
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    void rf.fitView({ nodes: [{ id }], maxZoom: 1.2, duration: settings.reducedMotion ? 0 : 350 });
  };

  if (q.loading && !loaded) return <div style={{ padding: 24 }}><Skeleton lines={5} /></div>;
  const missing = (q.error as { code?: string } | null)?.code === 'NOT_FOUND';
  if (q.error && !missing) return <div style={{ padding: 24 }}><ErrorState message={q.error.message} onRetry={q.reload} /></div>;
  if (!loaded) return <div style={{ padding: 24 }}><EmptyState icon="graph" title="Graph not found" action={<Link className="ukw-btn" to="/graphs">All graphs</Link>}>It may have been deleted. Check Settings → Trash.</EmptyState></div>;

  const { graph } = loaded;
  const selectedNodeRecs = selNodes.map((id) => loaded.nodes.find((n) => n.id === id)).filter((n): n is GraphNodeRecord => !!n);
  const selectedEdgeRecs = selEdges.map((id) => loaded.edges.find((e) => e.id === id)).filter((e): e is GraphEdgeRecord => !!e);
  const hasSelection = selectedNodeRecs.length + selectedEdgeRecs.length > 0;
  const one = selectedNodeRecs.length === 1 && selectedEdgeRecs.length === 0 ? selectedNodeRecs[0]! : null;
  const oneEdge = selectedEdgeRecs.length === 1 && selectedNodeRecs.length === 0 ? selectedEdgeRecs[0]! : null;
  const vp = graph.viewport;
  const untouched = vp.x === 0 && vp.y === 0 && vp.zoom === 1;

  const inspector = (
    <aside className="ginspector" aria-label="Inspector">
      {one ? (
        <>
          <h2 style={{ fontSize: '1rem' }}>{one.type === 'group' ? 'Group' : 'Node'}</h2>
          <Field label="Label">{() => <AutoField key={one.id} label="Node label" value={one.label} multiline rows={2} onCommit={(v) => void store.graphs.updateNode(one.id, { label: v })} />}</Field>
          {one.type !== 'group' ? (
            <>
              <Field label="Details">{() => <AutoField key={`b-${one.id}`} label="Node details" value={one.body ?? ''} multiline onCommit={(v) => void store.graphs.updateNode(one.id, { body: v || undefined })} />}</Field>
              <Field label="Type">{(id) => <select id={id} className="ukw-input" value={one.type} onChange={(e) => void store.graphs.updateNode(one.id, { type: e.target.value as GraphNodeType })}>{NODE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>}</Field>
              <Field label="Shape">{() => <Segmented<NodeShape> label="Shape" value={one.shape} onChange={(v) => void store.graphs.updateNode(one.id, { shape: v })} options={SHAPES.map((s) => ({ value: s, label: s }))} />}</Field>
            </>
          ) : null}
          <ColourRow value={one.colour} onPick={(c) => void store.graphs.updateNode(one.id, { colour: c })} />
          {one.sourceRef?.documentId ? <SourceLink rec={one} /> : null}
        </>
      ) : oneEdge ? (
        <>
          <h2 style={{ fontSize: '1rem' }}>Connection</h2>
          <Field label="Label">{() => <AutoField key={oneEdge.id} label="Connection label" value={oneEdge.label ?? ''} onCommit={(v) => void store.graphs.updateEdge(oneEdge.id, { label: v || undefined })} />}</Field>
          <Field label="Relationship">{() => <AutoField key={`r-${oneEdge.id}`} label="Relationship type" value={oneEdge.relationType ?? ''} onCommit={(v) => void store.graphs.updateEdge(oneEdge.id, { relationType: v || undefined })} />}</Field>
          <Switch label="Arrow" checked={oneEdge.directed} onChange={(v) => void store.graphs.updateEdge(oneEdge.id, { directed: v })} />
          <Segmented label="Line style" value={oneEdge.connector} onChange={(v) => void store.graphs.updateEdge(oneEdge.id, { connector: v })} options={[{ value: 'curved', label: 'Curved' }, { value: 'straight', label: 'Straight' }, { value: 'orthogonal', label: 'Elbow' }]} />
          <ColourRow value={oneEdge.colour} onPick={(c) => void store.graphs.updateEdge(oneEdge.id, { colour: c })} />
        </>
      ) : hasSelection ? (
        <h2 style={{ fontSize: '1rem' }}>{plural(selectedNodeRecs.length, 'node')}{selectedEdgeRecs.length ? ` · ${plural(selectedEdgeRecs.length, 'connection')}` : ''} selected</h2>
      ) : (
        <>
          <h2 style={{ fontSize: '1rem' }}>Graph</h2>
          <Field label="Title">{() => <AutoField label="Graph title" value={graph.title} onCommit={(v) => { if (v.trim()) void store.graphs.update(graphId, { title: v.trim() }); }} />}</Field>
          <Field label="Kind">{(id) => <select id={id} className="ukw-input" value={graph.kind} onChange={(e) => void store.graphs.update(graphId, { kind: e.target.value as GraphKind })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>}</Field>
          <Field label="Description">{() => <AutoField label="Graph description" multiline value={graph.description ?? ''} onCommit={(v) => void store.graphs.update(graphId, { description: v || undefined }, { history: false })} />}</Field>
          <Switch label="Show grid" checked={graph.gridEnabled} onChange={(v) => void store.graphs.update(graphId, { gridEnabled: v }, { history: false })} />
          <Switch label="Snap to grid" checked={graph.snapEnabled} onChange={(v) => void store.graphs.update(graphId, { snapEnabled: v }, { history: false })} />
          <div className="kv"><div><b>{loaded.nodes.length}</b>nodes</div><div><b>{loaded.edges.length}</b>connections</div></div>
          {loaded.issues.length ? (
            <details><summary>{plural(loaded.issues.length, 'suggestion')}</summary>
              <ul style={{ paddingLeft: 18 }}>{loaded.issues.slice(0, 20).map((i) => <li key={i.kind + i.id}><button type="button" className="ukw-btn ukw-btn--ghost ukw-btn--sm" onClick={() => { if (loaded.nodes.some((n) => n.id === i.id)) { setSelNodes([i.id]); setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === i.id }))); void rf.fitView({ nodes: [{ id: i.id }], maxZoom: 1.2, duration: 300 }); } }}>{i.message}</button></li>)}</ul>
            </details>
          ) : null}
        </>
      )}
    </aside>
  );

  return (
    <div className={`gwrap gwrap--inspector`}>
      <div className="gcanvas">
        <ReactFlow<UkwFlowNode>
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onNodeDragStart={onDragStart} onNodeDrag={onDrag} onNodeDragStop={onDragStop}
          onConnect={(c) => { if (c.source && c.target) void connect(c.source, c.target); }}
          onDelete={({ nodes: ns, edges: es }) => void removeSelection(ns.map((n) => n.id), es.map((e) => e.id))}
          onSelectionChange={({ nodes: ns, edges: es }) => { setSelNodes((cur) => (cur.join() === ns.map((n) => n.id).join() ? cur : ns.map((n) => n.id))); setSelEdges((cur) => (cur.join() === es.map((e) => e.id).join() ? cur : es.map((e) => e.id))); }}
          onNodeClick={onNodeClick}
          onPaneClick={(e) => { if (e.detail === 2) { const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }); void addNode('text', { x: Math.round(p.x - 90), y: Math.round(p.y - 32) }); } if (mode === 'connect') setConnectFrom(null); }}
          onMoveEnd={(_, v) => saveViewport(v)}
          defaultViewport={vp} fitView={untouched && firstFit.current} fitViewOptions={{ padding: 0.25 }} onInit={() => { firstFit.current = false; }}
          minZoom={0.1} maxZoom={2.5} zoomOnDoubleClick={false}
          panOnDrag={mode === 'select' ? false : true} selectionOnDrag={mode === 'select'} selectionMode={SelectionMode.Partial} multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
          connectionMode={ConnectionMode.Loose} connectionRadius={36}
          snapToGrid={graph.snapEnabled} snapGrid={[20, 20]} deleteKeyCode={['Backspace', 'Delete']}
          colorMode={document.documentElement.getAttribute('data-ukw-theme') === 'light' ? 'light' : 'dark'}
          proOptions={{ hideAttribution: true }} aria-label={`Graph: ${graph.title}`}
        >
          {graph.gridEnabled ? <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} color="var(--ukw-border-strong)" /> : null}
          <Controls showInteractive={false} />
          {minimap ? <MiniMap pannable zoomable ariaLabel="Graph overview" nodeColor="var(--ukw-accent)" maskColor="rgba(0,0,0,.15)" /> : null}
        </ReactFlow>

        <div className="gtools" role="toolbar" aria-label="Graph tools">
          <IconButton icon="arrow" label="Back to graphs" onClick={() => navigate('/graphs')} style={{ transform: 'scaleX(-1)' }} />
          <span className="sep" />
          <IconButton icon="plus" label="Add node (or double-click the canvas)" onClick={() => void addNode('text')} />
          <select aria-label="Add specific node type" className="ukw-input" style={{ width: 'auto', minHeight: 36, padding: '0 6px' }} value="" onChange={(e) => { if (e.target.value) void addNode(e.target.value as GraphNodeType); }}>
            <option value="">Type…</option>{NODE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <IconButton icon="highlight" label="Add from highlights, notes and sources" onClick={() => setSourceOpen(true)} />
          <span className="sep" />
          <IconButton icon="eye" label="Pan mode" active={mode === 'pan'} onClick={() => { setMode('pan'); setConnectFrom(null); }} />
          <IconButton icon="shapes" label="Multi-select mode (drag a box, tap to toggle)" active={mode === 'select'} onClick={() => { setMode('select'); setConnectFrom(null); }} />
          <IconButton icon="link" label="Connect mode (tap two nodes)" active={mode === 'connect'} onClick={() => setMode('connect')} />
          <span className="sep" />
          <IconButton icon="group" label="Group selected nodes" disabled={selectedNodeRecs.filter((n) => n.type !== 'group').length < 2} onClick={async () => { try { await store.graphs.groupNodes(selectedNodeRecs.map((n) => n.id)); } catch (e) { fail(e, 'Could not group'); } }} />
          <IconButton icon="scissors" label="Ungroup" disabled={!selectedNodeRecs.some((n) => n.type === 'group')} onClick={async () => { for (const g of selectedNodeRecs.filter((n) => n.type === 'group')) await store.graphs.ungroup(g.id); }} />
          <IconButton icon="copy" label="Duplicate selected nodes" disabled={!selectedNodeRecs.length} onClick={async () => { const c = await store.graphs.duplicateNodes(selectedNodeRecs.map((n) => n.id)); setSelNodes(c.map((n) => n.id)); }} />
          <IconButton icon="trash" label="Delete selection" disabled={!hasSelection} onClick={() => void removeSelection(selNodes, selEdges)} />
          <span className="sep" />
          <IconButton icon="layout" label="Auto-arrange" onClick={() => setLayoutOpen(true)} />
          <IconButton icon="fit" label="Fit to screen" onClick={() => void rf.fitView({ padding: 0.2, duration: settings.reducedMotion ? 0 : 300 })} />
          <IconButton icon="search" label="Search nodes" active={searchOpen} onClick={() => setSearchOpen((o) => !o)} />
          <IconButton icon="layout" label={minimap ? 'Hide overview map' : 'Show overview map'} active={minimap} onClick={() => setMinimap((m) => !m)} />
          <IconButton icon="download" label="Export graph" onClick={() => setExportOpen(true)} />
          {searchOpen ? (
            <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
              <TextInput aria-label="Find in graph" autoFocus style={{ width: 150, minHeight: 34 }} placeholder="Find…" value={search} onChange={(e) => { setSearch(e.target.value); setMatchIdx(0); }} onKeyDown={(e) => { if (e.key === 'Enter') stepMatch(e.shiftKey ? -1 : 1); if (e.key === 'Escape') { setSearch(''); setSearchOpen(false); } }} />
              <span className="muted" aria-live="polite" style={{ fontSize: '.8rem' }}>{search ? `${matchIds.length ? matchIdx + 1 : 0}/${matchIds.length}` : ''}</span>
              <IconButton size="sm" icon="chevron-up" label="Previous match" onClick={() => stepMatch(-1)} />
              <IconButton size="sm" icon="chevron-down" label="Next match" onClick={() => stepMatch(1)} />
            </span>
          ) : null}
        </div>
        {mode === 'connect' ? <div className="bulkbar" style={{ position: 'absolute', left: 12, bottom: 12, right: 12, maxWidth: 420 }}>{connectFrom ? 'Tap the node to connect to' : 'Tap the first node'}<span className="grow" /><Button size="sm" variant="ghost" onClick={() => { setMode('pan'); setConnectFrom(null); }}>Done</Button></div> : null}
        {loaded.nodes.length === 0 ? <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}><div style={{ pointerEvents: 'auto' }}><EmptyState icon="graph" title="An empty canvas" action={<Button variant="primary" icon="plus" onClick={() => void addNode('text')}>Add the first node</Button>}>Double-click anywhere to add an idea, or pull in a highlight with the marker button.</EmptyState></div></div> : null}
      </div>
      {inspector}

      <SourcePicker open={sourceOpen} onClose={() => setSourceOpen(false)} onPick={async (r) => {
        setSourceOpen(false);
        try { const n = await store.graphs.addSourceNode(graphId, r.entityType === 'annotation' ? { annotationId: r.entityId } : r.entityType === 'note' ? { noteId: r.entityId } : { documentId: r.entityId }, centerPos()); setSelNodes([n.id]); void rf.fitView({ nodes: [{ id: n.id }], maxZoom: 1.1, duration: 300 }); } catch (e) { fail(e, 'Could not add that source'); }
      }} />
      <Dialog open={layoutOpen} title="Auto-arrange" onClose={() => setLayoutOpen(false)}>
        <p className="muted">Rearranges node positions only. You can undo it.</p>
        <div className="rows">
          {([['layered-tb', 'Top to bottom (hierarchy)'], ['layered-lr', 'Left to right (flow)'], ['radial', 'Radial (mind map)'], ['grid', 'Grid']] as const).map(([k, label]) => <Button key={k} onClick={() => void runLayout(k)}>{label}</Button>)}
        </div>
      </Dialog>
      <Dialog open={exportOpen} title="Export graph" onClose={() => setExportOpen(false)}>
        <p className="muted">JSON keeps the graph editable and can be re-imported. SVG and PNG are pictures.</p>
        <div className="rows"><Button icon="download" onClick={() => void doExport('json')}>JSON (editable)</Button><Button icon="download" onClick={() => void doExport('svg')}>SVG image</Button><Button icon="download" onClick={() => void doExport('png')}>PNG image</Button></div>
      </Dialog>
      <span className="sr-only" aria-live="polite">{hasSelection ? `${selNodes.length} nodes and ${selEdges.length} connections selected` : ''}</span>
      {void dateStamp}
    </div>
  );
}

function ColourRow({ value, onPick }: { value?: string; onPick: (hex: string | undefined) => void }) {
  const s = useSettings();
  return (
    <Field label="Colour">{() => (
      <div role="radiogroup" aria-label="Colour" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button type="button" role="radio" aria-checked={!value} className={`swatch${!value ? ' is-selected' : ''}`} aria-label="No colour" title="No colour" style={{ background: 'var(--ukw-surface)' }} onClick={() => onPick(undefined)} />
        {s.palette.map((c) => <button key={c.id} type="button" role="radio" aria-checked={value?.toLowerCase() === c.hex.toLowerCase()} aria-label={c.label} title={c.label} className={`swatch${value?.toLowerCase() === c.hex.toLowerCase() ? ' is-selected' : ''}`} style={{ background: c.hex }} onClick={() => onPick(c.hex)} />)}
      </div>
    )}</Field>
  );
}

function SourceLink({ rec }: { rec: GraphNodeRecord }) {
  const doc = useStoreQuery((s) => s.documents.get(rec.sourceRef!.documentId!), [rec.sourceRef?.documentId], ['documents']);
  const ann = rec.sourceRef?.annotationId;
  if (doc.loading && !doc.data) return null;
  if (!doc.data) return <p className="muted"><Icon name="alert" size={14} /> The linked source is no longer available.</p>;
  return <Link className="ukw-btn" to={`/doc/${doc.data.id}${ann ? `?focus=${ann}` : ''}`}><Icon name="link" size={16} /> Open source: {(doc.data.title ?? doc.data.canonicalUrl).slice(0, 36)}</Link>;
}

export default function GraphEditor() {
  const { id = '' } = useParams();
  return (
    <ReactFlowProvider>
      <Editor key={id} graphId={id} />
    </ReactFlowProvider>
  );
}
