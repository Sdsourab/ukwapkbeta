import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Dialog, EmptyState, ErrorState, Field, Icon, IconButton, Segmented, Skeleton, TextArea, TextInput, useDebouncedCallback, useToast } from '@ukw/ui';
import { CITATION_STYLES, UkwError, formatBibliography, formatCitation, type Author, type CitationStyle, type ReferenceEntryType, type ReferenceRecord, type ResearchItem, type TaskStatus } from '@ukw/domain';
import { plural, timeAgo } from '../lib/format';
import { useStore, useStoreQuery } from '../store-context';

type Tab = 'overview' | 'references' | 'matrices' | 'tasks' | 'sources';
type TrackerList = 'questions' | 'objectives' | 'gaps' | 'hypotheses';
const TRACKERS: Array<{ key: TrackerList; label: string; hint: string }> = [
  { key: 'questions', label: 'Research questions', hint: 'What are you trying to find out?' },
  { key: 'objectives', label: 'Objectives', hint: 'What will you deliver?' },
  { key: 'gaps', label: 'Gaps in the literature', hint: 'What is missing or unresolved?' },
  { key: 'hypotheses', label: 'Hypotheses', hint: 'What do you expect to find?' },
];
const NEXT_ITEM: Record<ResearchItem['status'], ResearchItem['status']> = { open: 'in-progress', 'in-progress': 'resolved', resolved: 'open' };
const STATUS_LABEL: Record<ResearchItem['status'], string> = { open: 'Open', 'in-progress': 'In progress', resolved: 'Resolved' };

function parseAuthors(s: string): Author[] {
  return s.split(';').map((a) => a.trim()).filter(Boolean).map((a) => { const [family, given] = a.split(',').map((x) => x.trim()); return { family: family ?? a, given: given || undefined }; });
}
const authorsToText = (a: Author[]) => a.map((x) => (x.given ? `${x.family}, ${x.given}` : x.family)).join('; ');

function ProjectList() {
  const store = useStore();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState(params.get('new') === '1');
  const [title, setTitle] = useState('');
  const [err, setErr] = useState('');
  const q = useStoreQuery((s) => s.projects.list(), [], ['researchProjects']);
  const create = async () => {
    try { const p = await store.projects.createProject({ title }); setOpen(false); navigate(`/research/${p.id}`); } catch (e) { setErr(e instanceof UkwError ? e.message : 'Could not create'); }
  };
  return (
    <>
      <div className="pagehead"><div><h1>Research</h1><p>Projects bring together sources, references, evidence matrices and tasks.</p></div><Button variant="primary" icon="plus" onClick={() => setOpen(true)}>New project</Button></div>
      {q.loading && !q.data ? <Skeleton lines={3} /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : (q.data?.length ?? 0) === 0 ? (
        <EmptyState icon="flask" title="No research projects yet" action={<Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Start a project</Button>}>Track your questions, collect references and compare the literature in one place.</EmptyState>
      ) : (
        <div className="rows">
          {q.data!.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((p) => (
            <Link key={p.id} to={`/research/${p.id}`} className="card row" style={{ gridTemplateColumns: 'auto minmax(0,1fr)' }}>
              <div className="row__icon"><Icon name="flask" size={20} /></div>
              <div style={{ minWidth: 0 }}><div className="row__title">{p.title}</div><div className="row__meta"><span className="badge">{p.status}</span><span>{plural(p.questions.length, 'question')}</span><span>{timeAgo(p.updatedAt)}</span></div></div>
            </Link>
          ))}
        </div>
      )}
      <Dialog open={open} title="New research project" onClose={() => { setOpen(false); if (params.get('new')) setParams({}); }} footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={() => void create()} disabled={!title.trim()}>Create</Button></>}>
        <Field label="Project title" error={err}>{(id, d) => <TextInput id={id} aria-describedby={d} value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} autoFocus />}</Field>
      </Dialog>
    </>
  );
}

function Trackers({ projectId }: { projectId: string }) {
  const store = useStore();
  const toast = useToast();
  const q = useStoreQuery((s) => s.projects.require(projectId), [projectId], ['researchProjects']);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const p = q.data;
  const { call } = useDebouncedCallback((m: string) => { void store.projects.update(projectId, { methodology: m }); }, 700);
  if (!p) return <Skeleton lines={4} />;
  const add = async (key: TrackerList) => {
    try { await store.projects.addItem(projectId, key, drafts[key] ?? ''); setDrafts((d) => ({ ...d, [key]: '' })); } catch (e) { toast({ message: e instanceof UkwError ? e.message : 'Could not add', kind: 'error' }); }
  };
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {TRACKERS.map((t) => (
        <section key={t.key} className="card section" aria-label={t.label}>
          <h2>{t.label}</h2>
          {p[t.key].length === 0 ? <p className="muted">{t.hint}</p> : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
              {p[t.key].map((it) => (
                <li key={it.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button type="button" className={`badge${it.status === 'resolved' ? ' badge--accent' : ''}`} style={{ cursor: 'pointer', border: 0 }} title="Change status" onClick={() => void store.projects.updateItem(projectId, t.key, it.id, { status: NEXT_ITEM[it.status] })}>{STATUS_LABEL[it.status]}</button>
                  <span style={{ flex: 1, textDecoration: it.status === 'resolved' ? 'line-through' : undefined, overflowWrap: 'anywhere' }}>{it.text}</span>
                  <IconButton size="sm" icon="x" label="Remove" onClick={() => void store.projects.removeItem(projectId, t.key, it.id)} />
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <TextInput aria-label={`Add to ${t.label}`} placeholder="Add…" value={drafts[t.key] ?? ''} onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') void add(t.key); }} />
            <Button icon="plus" onClick={() => void add(t.key)} disabled={!(drafts[t.key] ?? '').trim()}>Add</Button>
          </div>
        </section>
      ))}
      <section className="card section"><h2>Methodology</h2><TextArea aria-label="Methodology notes" rows={5} defaultValue={p.methodology ?? ''} onChange={(e) => call(e.target.value)} placeholder="Design, data, analysis plan…" /></section>
    </div>
  );
}

function ReferenceDialog({ open, onClose, projectId, editing }: { open: boolean; onClose: () => void; projectId: string; editing?: ReferenceRecord }) {
  const store = useStore();
  const [f, setF] = useState(() => ({
    title: editing?.title ?? '', authors: editing ? authorsToText(editing.authors) : '', year: editing?.year ? String(editing.year) : '', journal: editing?.journal ?? '', volume: editing?.volume ?? '', issue: editing?.issue ?? '', pages: editing?.pages ?? '',
    doi: editing?.doi ?? '', url: editing?.url ?? '', publisher: editing?.publisher ?? '', abstract: editing?.abstract ?? '', entryType: (editing?.entryType ?? 'article') as ReferenceEntryType, findings: editing?.findings ?? '', method: editing?.method ?? '', limitations: editing?.limitations ?? '',
  }));
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    try {
      const doiTaken = f.doi.trim() ? await store.references.findByDoi(f.doi) : undefined;
      if (doiTaken && doiTaken.id !== editing?.id) { setErr('A reference with this DOI already exists.'); return; }
      const data = { title: f.title, authors: parseAuthors(f.authors), year: f.year ? Number(f.year) : undefined, journal: f.journal || undefined, volume: f.volume || undefined, issue: f.issue || undefined, pages: f.pages || undefined, doi: f.doi.trim() || undefined, url: f.url || undefined, publisher: f.publisher || undefined, abstract: f.abstract || undefined, entryType: f.entryType, findings: f.findings || undefined, method: f.method || undefined, limitations: f.limitations || undefined };
      if (editing) await store.references.update(editing.id, data); else await store.references.createReference({ ...data, projectId });
      onClose();
    } catch (e) { setErr(e instanceof UkwError ? e.message : 'Could not save'); }
  };
  return (
    <Dialog open={open} wide title={editing ? 'Edit reference' : 'Add reference'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={!f.title.trim()}>Save</Button></>}>
      <Field label="Title" error={err}>{(id, d) => <TextInput id={id} aria-describedby={d} value={f.title} onChange={set('title')} autoFocus />}</Field>
      <Field label="Authors" hint="Family, Given; Family, Given">{(id, d) => <TextInput id={id} aria-describedby={d} value={f.authors} onChange={set('authors')} />}</Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <Field label="Type">{(id) => <select id={id} className="ukw-input" value={f.entryType} onChange={set('entryType')}>{(['article', 'book', 'chapter', 'report', 'web', 'conference', 'thesis', 'other'] as const).map((t) => <option key={t}>{t}</option>)}</select>}</Field>
        <Field label="Year">{(id) => <TextInput id={id} inputMode="numeric" value={f.year} onChange={set('year')} />}</Field>
        <Field label="Journal / container">{(id) => <TextInput id={id} value={f.journal} onChange={set('journal')} />}</Field>
        <Field label="Publisher">{(id) => <TextInput id={id} value={f.publisher} onChange={set('publisher')} />}</Field>
        <Field label="Volume">{(id) => <TextInput id={id} value={f.volume} onChange={set('volume')} />}</Field>
        <Field label="Issue">{(id) => <TextInput id={id} value={f.issue} onChange={set('issue')} />}</Field>
        <Field label="Pages">{(id) => <TextInput id={id} value={f.pages} onChange={set('pages')} />}</Field>
        <Field label="DOI">{(id) => <TextInput id={id} value={f.doi} onChange={set('doi')} />}</Field>
      </div>
      <Field label="URL">{(id) => <TextInput id={id} value={f.url} onChange={set('url')} />}</Field>
      <Field label="Abstract">{(id) => <TextArea id={id} rows={3} value={f.abstract} onChange={set('abstract')} />}</Field>
      <Field label="Method">{(id) => <TextInput id={id} value={f.method} onChange={set('method')} />}</Field>
      <Field label="Findings">{(id) => <TextArea id={id} rows={2} value={f.findings} onChange={set('findings')} />}</Field>
      <Field label="Limitations">{(id) => <TextArea id={id} rows={2} value={f.limitations} onChange={set('limitations')} />}</Field>
    </Dialog>
  );
}

function References({ projectId }: { projectId: string }) {
  const store = useStore();
  const toast = useToast();
  const q = useStoreQuery((s) => s.references.listForProject(projectId), [projectId], ['references']);
  const [style, setStyle] = useState<CitationStyle>('apa');
  const [dlg, setDlg] = useState<{ open: boolean; editing?: ReferenceRecord }>({ open: false });
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast({ message: 'Copied', kind: 'success' }); } catch { toast({ message: 'Copy was blocked by the browser.', kind: 'error' }); } };
  const refs = q.data ?? [];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="toolbar">
        <Button variant="primary" icon="plus" onClick={() => setDlg({ open: true })}>Add reference</Button>
        <Segmented<CitationStyle> label="Citation style" value={style} onChange={setStyle} options={CITATION_STYLES.map((s) => ({ value: s, label: s.toUpperCase() }))} />
        {refs.length ? <Button icon="copy" onClick={() => void copy(formatBibliography(refs, style).join('\n\n'))}>Copy bibliography</Button> : null}
      </div>
      <p className="muted">Citations are generated from templates and should be checked against your style guide before submission.</p>
      {refs.length === 0 ? <EmptyState icon="book" title="No references yet">Add the papers and books this project relies on.</EmptyState> : (
        <div className="rows">
          {refs.map((r) => (
            <article key={r.id} className="card section" style={{ gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}><strong>{r.title}</strong><div className="muted">{authorsToText(r.authors) || 'No authors'}{r.year ? ` · ${r.year}` : ''}</div></div>
                <select aria-label="Reading status" className="ukw-input" style={{ width: 'auto', minHeight: 34 }} value={r.readingStatus} onChange={(e) => void store.references.update(r.id, { readingStatus: e.target.value as ReferenceRecord['readingStatus'] })}><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option></select>
              </div>
              <p style={{ fontSize: '.92rem', overflowWrap: 'anywhere' }}>{formatCitation(r, style)}</p>
              <div style={{ display: 'flex', gap: 4 }}>
                <IconButton size="sm" icon="copy" label="Copy citation" onClick={() => void copy(formatCitation(r, style))} />
                <IconButton size="sm" icon="edit" label="Edit reference" onClick={() => setDlg({ open: true, editing: r })} />
                <span className="grow" />
                <IconButton size="sm" icon="trash" label="Delete reference" onClick={async () => { await store.references.remove(r.id); toast({ message: 'Reference deleted', actionLabel: 'Undo', onAction: () => void store.undo() }); }} />
              </div>
            </article>
          ))}
        </div>
      )}
      {dlg.open ? <ReferenceDialog key={dlg.editing?.id ?? 'new'} open onClose={() => setDlg({ open: false })} projectId={projectId} editing={dlg.editing} /> : null}
    </div>
  );
}

function Matrices({ projectId }: { projectId: string }) {
  const store = useStore();
  const toast = useToast();
  const q = useStoreQuery(async (s) => (await s.matrices.list()).filter((m) => m.projectId === projectId), [projectId], ['matrices']);
  const refs = useStoreQuery((s) => s.references.listForProject(projectId), [projectId], ['references']);
  const [sel, setSel] = useState('');
  const list = q.data ?? [];
  const m = list.find((x) => x.id === (sel || list[0]?.id));
  const refTitle = (id?: string) => refs.data?.find((r) => r.id === id)?.title;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="toolbar">
        <Button icon="plus" onClick={async () => { const x = await store.matrices.createMatrix({ title: 'Literature comparison', kind: 'literature', projectId }); setSel(x.id); }}>Literature matrix</Button>
        <Button icon="plus" onClick={async () => { const x = await store.matrices.createMatrix({ title: 'Evidence matrix', kind: 'evidence', projectId }); setSel(x.id); }}>Evidence matrix</Button>
        {list.length > 1 ? <select aria-label="Choose matrix" className="ukw-input" style={{ width: 'auto' }} value={m?.id} onChange={(e) => setSel(e.target.value)}>{list.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}</select> : null}
      </div>
      {!m ? <EmptyState icon="layout" title="No matrices yet">Compare studies side by side, or line up claims against evidence.</EmptyState> : (
        <div className="card section">
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <TextInput aria-label="Matrix title" defaultValue={m.title} key={m.id} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== m.title) void store.matrices.update(m.id, { title: e.target.value.trim() }); }} />
            <Button size="sm" icon="plus" onClick={() => void store.matrices.addRow(m.id, {})}>Row</Button>
            <Button size="sm" icon="plus" onClick={() => { const n = window.prompt('Column name'); if (n?.trim()) void store.matrices.addColumn(m.id, n); }}>Column</Button>
            <IconButton size="sm" icon="trash" label="Delete matrix" onClick={async () => { await store.matrices.remove(m.id); toast({ message: 'Matrix deleted', actionLabel: 'Undo', onAction: () => void store.undo() }); }} />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '100%' }}>
              <thead><tr><th style={{ textAlign: 'left', padding: 8 }}>{m.kind === 'literature' ? 'Source' : 'Item'}</th>{m.columns.map((c) => <th key={c.id} style={{ textAlign: 'left', padding: 8 }}>{c.label} <IconButton size="sm" icon="x" label={`Remove column ${c.label}`} onClick={() => void store.matrices.removeColumn(m.id, c.id)} /></th>)}<th /></tr></thead>
              <tbody>
                {m.rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--ukw-border)', verticalAlign: 'top' }}>
                    <td style={{ padding: 6, minWidth: 160 }}>
                      {m.kind === 'literature' ? (
                        <select aria-label="Reference" className="ukw-input" value={r.referenceId ?? ''} onChange={async (e) => { const v = e.target.value; const next = m.rows.map((x) => (x.id === r.id ? { ...x, referenceId: v || undefined } : x)); await store.matrices.update(m.id, { rows: next }); }}><option value="">Choose…</option>{(refs.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.title.slice(0, 60)}</option>)}</select>
                      ) : <TextInput aria-label="Item" defaultValue={r.label ?? ''} onBlur={async (e) => { if (e.target.value !== (r.label ?? '')) await store.matrices.update(m.id, { rows: m.rows.map((x) => (x.id === r.id ? { ...x, label: e.target.value } : x)) }); }} />}
                      {r.referenceId && !refTitle(r.referenceId) ? <span className="badge badge--warn">missing reference</span> : null}
                    </td>
                    {m.columns.map((c) => <td key={c.id} style={{ padding: 6, minWidth: 180 }}><TextArea aria-label={`${c.label} for row`} rows={2} defaultValue={r.cells[c.id] ?? ''} onBlur={(e) => { if (e.target.value !== (r.cells[c.id] ?? '')) void store.matrices.setCell(m.id, r.id, c.id, e.target.value); }} /></td>)}
                    <td><IconButton size="sm" icon="trash" label="Delete row" onClick={() => void store.matrices.removeRow(m.id, r.id)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Tasks({ projectId }: { projectId: string }) {
  const store = useStore();
  const q = useStoreQuery(async (s) => (await s.tasks.list()).filter((t) => t.projectId === projectId), [projectId], ['tasks']);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const add = async () => { if (!title.trim()) return; await store.tasks.createTask({ title, projectId, dueAt: due ? new Date(due).toISOString() : null }); setTitle(''); setDue(''); };
  const NEXT: Record<TaskStatus, TaskStatus> = { todo: 'doing', doing: 'done', done: 'todo', blocked: 'todo' };
  const tasks = [...(q.data ?? [])].sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="toolbar"><TextInput aria-label="New task" placeholder="Add a task…" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void add(); }} /><input aria-label="Due date" type="date" className="ukw-input" style={{ width: 'auto' }} value={due} onChange={(e) => setDue(e.target.value)} /><Button icon="plus" onClick={() => void add()} disabled={!title.trim()}>Add</Button></div>
      {tasks.length === 0 ? <EmptyState icon="task" title="No tasks">Break the project into steps you can tick off.</EmptyState> : (
        <div className="rows">
          {tasks.map((t) => (
            <div key={t.id} className="card doclink" style={{ padding: '6px 8px 6px 14px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                <button type="button" className="badge" style={{ cursor: 'pointer', border: 0 }} onClick={() => void store.tasks.setStatus(t.id, NEXT[t.status])} title="Change status">{t.status}</button>
                <span style={{ textDecoration: t.status === 'done' ? 'line-through' : undefined, overflowWrap: 'anywhere' }}>{t.title}</span>
                {t.dueAt ? <span className="muted">due {new Date(t.dueAt).toLocaleDateString()}</span> : null}
              </div>
              <IconButton size="sm" icon="trash" label="Delete task" onClick={() => void store.tasks.remove(t.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Sources({ projectId }: { projectId: string }) {
  const store = useStore();
  const q = useStoreQuery(async (s) => { const [docs, graphs] = await Promise.all([s.documents.list(), s.graphs.list()]); return { docs, graphs }; }, [], ['documents', 'graphs']);
  const linkedDocs = q.data?.docs.filter((d) => d.projectId === projectId) ?? [];
  const freeDocs = q.data?.docs.filter((d) => !d.projectId) ?? [];
  const linkedGraphs = q.data?.graphs.filter((g) => g.projectId === projectId) ?? [];
  const freeGraphs = q.data?.graphs.filter((g) => !g.projectId) ?? [];
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <section className="card section"><h2>Sources</h2>
        {linkedDocs.length === 0 ? <p className="muted">No sources linked yet.</p> : linkedDocs.map((d) => <div key={d.id} className="doclink"><Link to={`/doc/${d.id}`}>{d.title ?? d.canonicalUrl}</Link><IconButton size="sm" icon="x" label="Unlink" onClick={() => void store.documents.update(d.id, { projectId: null })} /></div>)}
        {freeDocs.length ? <select aria-label="Link a source" className="ukw-input" value="" onChange={(e) => { if (e.target.value) void store.documents.update(e.target.value, { projectId }); }}><option value="">Link a source…</option>{freeDocs.map((d) => <option key={d.id} value={d.id}>{(d.title ?? d.canonicalUrl).slice(0, 70)}</option>)}</select> : null}
      </section>
      <section className="card section"><h2>Graphs</h2>
        {linkedGraphs.length === 0 ? <p className="muted">No graphs linked yet.</p> : linkedGraphs.map((g) => <div key={g.id} className="doclink"><Link to={`/graphs/${g.id}`}>{g.title}</Link><IconButton size="sm" icon="x" label="Unlink" onClick={() => void store.graphs.update(g.id, { projectId: null })} /></div>)}
        {freeGraphs.length ? <select aria-label="Link a graph" className="ukw-input" value="" onChange={(e) => { if (e.target.value) void store.graphs.update(e.target.value, { projectId }); }}><option value="">Link a graph…</option>{freeGraphs.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select> : null}
      </section>
    </div>
  );
}

function ProjectDetail({ id }: { id: string }) {
  const store = useStore();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const q = useStoreQuery(async (s) => { const p = await s.projects.get(id); return p ? { p, summary: await s.projects.summary(id) } : null; }, [id], ['researchProjects', 'references', 'documents', 'graphs', 'tasks', 'matrices', 'notes']);
  const [title, setTitle] = useState('');
  useEffect(() => { if (q.data) setTitle(q.data.p.title); }, [q.data?.p.title]); // eslint-disable-line react-hooks/exhaustive-deps
  if (q.loading && !q.data) return <Skeleton lines={5} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!q.data) return <EmptyState icon="flask" title="Project not found" action={<Link className="ukw-btn" to="/research">All projects</Link>} />;
  const { p, summary } = q.data;
  return (
    <>
      <div className="pagehead">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><IconButton icon="chevron-left" label="All projects" onClick={() => navigate('/research')} />
          <input aria-label="Project title" className="ukw-input" style={{ fontFamily: 'var(--ukw-font-display)', fontSize: '1.5rem', fontWeight: 600, border: 0, background: 'transparent', padding: 0 }} value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title !== p.title) void store.projects.update(id, { title: title.trim() }); else setTitle(p.title); }} /></div>
        <div className="toolbar">
          <select aria-label="Status" className="ukw-input" style={{ width: 'auto' }} value={p.status} onChange={(e) => void store.projects.update(id, { status: e.target.value as typeof p.status })}><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="archived">Archived</option></select>
          <IconButton icon="trash" label="Delete project" onClick={async () => { await store.projects.remove(id); navigate('/research'); toast({ message: 'Project deleted', actionLabel: 'Undo', onAction: () => void store.undo() }); }} />
        </div>
      </div>
      <div className="kv"><div><b>{summary.documents}</b>sources</div><div><b>{summary.references}</b>references</div><div><b>{summary.graphs}</b>graphs</div><div><b>{summary.tasks}</b>tasks</div><div><b>{summary.matrices}</b>matrices</div></div>
      <div className="tabs" role="tablist">{(['overview', 'references', 'matrices', 'tasks', 'sources'] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>{t[0]!.toUpperCase() + t.slice(1)}</button>)}</div>
      {tab === 'overview' ? <Trackers projectId={id} /> : tab === 'references' ? <References projectId={id} /> : tab === 'matrices' ? <Matrices projectId={id} /> : tab === 'tasks' ? <Tasks projectId={id} /> : <Sources projectId={id} />}
    </>
  );
}

export function Research() {
  const { id } = useParams();
  return id ? <ProjectDetail id={id} /> : <ProjectList />;
}
