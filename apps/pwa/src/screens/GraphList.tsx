import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Dialog, EmptyState, ErrorState, Icon, IconButton, Segmented, Skeleton, TextInput, useToast } from '@ukw/ui';
import { TEMPLATES } from '@ukw/database';
import { UkwError } from '@ukw/domain';
import { readFileText } from '../lib/download';
import { plural, timeAgo } from '../lib/format';
import { useStore, useStoreQuery } from '../store-context';

const TEMPLATE_INFO: Array<{ key: keyof typeof TEMPLATES; label: string; hint: string }> = [
  { key: 'blank', label: 'Blank', hint: 'Start from an empty canvas' },
  { key: 'concept-map', label: 'Concept map', hint: 'A central idea with related concepts' },
  { key: 'claim-evidence', label: 'Claim & evidence', hint: 'Claim, supporting and counter evidence, open question' },
  { key: 'flowchart', label: 'Flowchart', hint: 'Start, decision and two paths' },
];

export function GraphList() {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [creating, setCreating] = useState(false);
  const [template, setTemplate] = useState<keyof typeof TEMPLATES>('blank');
  const [title, setTitle] = useState('');

  const q = useStoreQuery(async (s) => {
    const [graphs, nodes] = await Promise.all([s.graphs.list(), s.db.nodes.filter((n) => !n.deletedAt).toArray()]);
    const counts = new Map<string, number>();
    for (const n of nodes) counts.set(n.graphId, (counts.get(n.graphId) ?? 0) + 1);
    return { graphs, counts };
  }, [], ['graphs', 'nodes']);

  const visible = useMemo(() => (q.data?.graphs ?? [])
    .filter((g) => (view === 'archived' ? g.isArchived : !g.isArchived) && g.title.toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [q.data, view, filter]);

  const create = async () => {
    const g = await store.graphs.createGraph({ template, title: title.trim() || undefined });
    setCreating(false); setTitle('');
    navigate(`/graphs/${g.id}`);
  };
  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const { graph, warnings } = await store.graphs.importGraph(JSON.parse(await readFileText(file, 50 * 1024 * 1024)));
      toast({ message: warnings.length ? `Imported with ${plural(warnings.length, 'warning')}: ${warnings[0]}` : 'Graph imported', kind: warnings.length ? 'info' : 'success', duration: 9000 });
      navigate(`/graphs/${graph.id}`);
    } catch (err) {
      toast({ message: err instanceof UkwError ? err.message : err instanceof SyntaxError ? 'That file is not valid JSON.' : err instanceof Error ? err.message : 'Import failed', kind: 'error' });
    } finally { if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <>
      <div className="pagehead">
        <div><h1>Graphs</h1><p>Concept maps, evidence maps and flowcharts, stored as editable data.</p></div>
        <div className="toolbar">
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => void importFile(e.target.files?.[0])} />
          <Button icon="upload" onClick={() => fileRef.current?.click()}>Import</Button>
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>New graph</Button>
        </div>
      </div>
      <div className="toolbar">
        <TextInput aria-label="Filter graphs" type="search" placeholder="Filter graphs" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived', icon: 'archive' }]} />
      </div>
      {q.loading && !q.data ? <Skeleton lines={4} /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : visible.length === 0 ? (
        <EmptyState icon="graph" title={view === 'archived' ? 'No archived graphs' : 'No graphs yet'} action={view === 'active' ? <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>Create a graph</Button> : undefined}>
          Turn highlights into nodes, connect ideas, and keep the source of every claim one tap away.
        </EmptyState>
      ) : (
        <div className="rows">
          {visible.map((g) => (
            <div key={g.id} className="card doclink">
              <Link to={`/graphs/${g.id}`} className="doclink__main">
                <div className="row__icon"><Icon name="graph" size={20} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="row__title">{g.title}</div>
                  <div className="row__meta"><span className="badge">{g.kind}</span><span>{plural(q.data!.counts.get(g.id) ?? 0, 'node')}</span><span>{timeAgo(g.updatedAt)}</span></div>
                </div>
              </Link>
              <span style={{ display: 'flex' }}>
                <IconButton size="sm" icon="star" label={g.isFavorite ? 'Unfavorite' : 'Favorite'} active={g.isFavorite} onClick={() => void store.graphs.update(g.id, { isFavorite: !g.isFavorite })} />
                <IconButton size="sm" icon="archive" label={g.isArchived ? 'Unarchive' : 'Archive'} onClick={() => void store.graphs.update(g.id, { isArchived: !g.isArchived })} />
                <IconButton size="sm" icon="trash" label={`Delete ${g.title}`} onClick={async () => { await store.graphs.remove(g.id); toast({ message: 'Graph deleted', actionLabel: 'Undo', onAction: () => void store.undo() }); }} />
              </span>
            </div>
          ))}
        </div>
      )}
      <Dialog open={creating} title="New graph" onClose={() => setCreating(false)} footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" onClick={() => void create()}>Create</Button></>}>
        <TextInput aria-label="Graph title" placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} autoFocus />
        <div className="rows" role="radiogroup" aria-label="Template">
          {TEMPLATE_INFO.map((t) => (
            <button key={t.key} type="button" role="radio" aria-checked={template === t.key} className="card" onClick={() => setTemplate(t.key)} style={{ textAlign: 'left', padding: 12, cursor: 'pointer', borderColor: template === t.key ? 'var(--ukw-accent)' : undefined, borderWidth: template === t.key ? 2 : 1 }}>
              <strong>{t.label}</strong><div className="muted">{t.hint}</div>
            </button>
          ))}
        </div>
      </Dialog>
    </>
  );
}
