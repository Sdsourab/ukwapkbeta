import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Button, Dialog, EmptyState, ErrorState, Field, IconButton, Skeleton, TextArea, useDebouncedCallback, useToast } from '@ukw/ui';
import { DEFAULT_PALETTE, annotationsToMarkdown, hexToRgba, isSafeLink, UkwError, type AnnotationRecord, type AnnotationType, type NoteRecord, type TextAnchor } from '@ukw/domain';
import { reattachAnchor, restoreAnchor } from '@ukw/anchor-engine';
import { AddToGraphDialog, CollectionPicker } from '../components/Pickers';
import { NoteEditor } from '../components/NoteEditor';
import { Reader, readerTextOf, restoreAll, type PendingSelection } from '../components/Reader';
import { TagEditor } from '../components/TagEditor';
import { downloadBlob, safeFilename } from '../lib/download';
import { hostOf, plural, timeAgo, truncate } from '../lib/format';
import { useSettings, useStore, useStoreQuery } from '../store-context';

type Tab = 'highlights' | 'notes' | 'info';

function Swatches({ value, onPick, label = 'Highlight colour' }: { value?: string; onPick: (hex: string) => void; label?: string }) {
  const settings = useSettings();
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {settings.palette.map((c) => (
        <button key={c.id} type="button" role="radio" aria-checked={value?.toLowerCase() === c.hex.toLowerCase()} aria-label={c.label} title={c.label}
          className={`swatch${value?.toLowerCase() === c.hex.toLowerCase() ? ' is-selected' : ''}`} style={{ background: c.hex }} onClick={() => onPick(c.hex)} />
      ))}
    </div>
  );
}

function AnnotationCard({ a, notes, active, onFocus, onGraph, onReattach, ambiguousCount }: { a: AnnotationRecord; notes: NoteRecord[]; active: boolean; onFocus: () => void; onGraph: () => void; onReattach?: () => void; ambiguousCount?: number }) {
  const store = useStore();
  const toast = useToast();
  const [palette, setPalette] = useState(false);
  const orphaned = a.status === 'orphaned';
  const del = async () => {
    await store.annotations.remove(a.id);
    toast({ message: 'Highlight deleted', actionLabel: 'Undo', onAction: () => void store.undo() });
  };
  return (
    <article className={`card ann${orphaned ? ' is-orphaned' : ''}`} style={{ ['--hl' as string]: a.colour ?? DEFAULT_PALETTE[0]!.hex, outline: active ? '2px solid var(--ukw-focus)' : undefined }} id={`ann-${a.id}`}>
      <div className="ann__quote" onClick={onFocus} style={{ cursor: 'pointer' }}>
        {a.anchor?.exact ? <>“{truncate(a.anchor.exact, 600)}”</> : <strong>{a.type === 'bookmark' ? 'Bookmark' : 'Sticky note'}{a.label ? `: ${a.label}` : ''}</strong>}
      </div>
      <div className="row__meta">
        <span className="badge">{a.type}</span>
        {orphaned ? <span className="badge badge--warn" title="The passage could not be found in the text.">Location lost</span> : null}
        <span>{timeAgo(a.updatedAt)}</span>
      </div>
      {orphaned && onReattach ? (
        <div className="muted" style={{ fontSize: '.9rem' }}>
          {ambiguousCount ? `${plural(ambiguousCount, 'possible match', 'possible matches')} found. ` : 'This passage changed or is missing. '}
          <button type="button" className="ukw-btn ukw-btn--sm" onClick={onReattach}>Reattach…</button>
        </div>
      ) : null}
      <NoteEditor note={notes[0]} documentId={a.documentId} annotationId={a.id} rows={2} placeholder="Add a note to this highlight…" />
      <TagEditor entityType="annotation" entityId={a.id} compact />
      <div className="ann__bar">
        <IconButton size="sm" icon="highlight" label="Change colour" active={palette} onClick={() => setPalette((p) => !p)} />
        <IconButton size="sm" icon="star" label={a.isFavorite ? 'Remove favorite' : 'Favorite'} active={a.isFavorite} onClick={() => void store.annotations.update(a.id, { isFavorite: !a.isFavorite })} />
        <IconButton size="sm" icon="graph" label="Add to graph" onClick={onGraph} />
        <IconButton size="sm" icon="archive" label="Archive highlight" onClick={() => void store.annotations.update(a.id, { status: 'archived' })} />
        <span className="grow" />
        <IconButton size="sm" icon="trash" label="Delete highlight" onClick={() => void del()} />
      </div>
      {palette ? <Swatches value={a.colour} onPick={(hex) => void store.annotations.setColour(a.id, hex)} /> : null}
    </article>
  );
}

function ManualHighlight({ documentId }: { documentId: string }) {
  const store = useStore();
  const toast = useToast();
  const [quote, setQuote] = useState('');
  const [colour, setColour] = useState<string>(DEFAULT_PALETTE[0]!.hex);
  const [err, setErr] = useState('');
  const add = async () => {
    try {
      await store.annotations.createAnnotation({ documentId, type: 'highlight', colour, anchor: { exact: quote.trim() } });
      setQuote(''); setErr('');
      toast({ message: 'Highlight added', kind: 'success' });
    } catch (e) { setErr(e instanceof UkwError ? e.message : 'Could not add the highlight'); }
  };
  return (
    <div className="card section">
      <Field label="Add a quote from this source" error={err} hint="Paste a passage you want to keep. Highlights made on the page itself come from the browser extension.">
        {(id, d) => <TextArea id={id} aria-describedby={d} rows={3} value={quote} onChange={(e) => setQuote(e.target.value)} />}
      </Field>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <Swatches value={colour} onPick={setColour} />
        <Button variant="primary" icon="plus" onClick={() => void add()} disabled={!quote.trim()}>Add highlight</Button>
      </div>
    </div>
  );
}

function ReattachDialog({ open, onClose, annotation, readerText, onChoose }: { open: boolean; onClose: () => void; annotation?: AnnotationRecord; readerText: string; onChoose: (range: { start: number; end: number }) => void }) {
  const candidates = useMemo(() => {
    if (!annotation?.anchor) return [];
    const r = restoreAnchor(readerText, annotation.anchor);
    return r.candidates.map((c) => ({ ...c, preview: readerText.slice(Math.max(0, c.start - 50), Math.min(readerText.length, c.end + 50)) }));
  }, [annotation, readerText]);
  return (
    <Dialog open={open} title="Reattach highlight" onClose={onClose}>
      {candidates.length === 0 ? (
        <p>No similar passage was found. Select the passage in the text and use <strong>Reattach to selection</strong>, or delete this highlight.</p>
      ) : (
        <>
          <p className="muted">Choose where this highlight belongs:</p>
          <div className="rows">
            {candidates.map((c, i) => (
              <button key={i} type="button" className="card" style={{ textAlign: 'left', padding: 12, cursor: 'pointer' }} onClick={() => onChoose({ start: c.start, end: c.end })}>
                …{readerText.slice(Math.max(0, c.start - 50), c.start)}<mark style={{ background: hexToRgba(annotation?.colour ?? '#F6D86B', 0.6), color: 'inherit' }}>{readerText.slice(c.start, c.end)}</mark>{readerText.slice(c.end, c.end + 50)}…
              </button>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}

export function DocumentView() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>('highlights');
  const [activeId, setActiveId] = useState<string | null>(params.get('focus'));
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [colour, setColour] = useState(settings.defaultColour);
  const [graphFor, setGraphFor] = useState<string | null>(null);
  const [collOpen, setCollOpen] = useState(false);
  const [reattachId, setReattachId] = useState<string | null>(null);
  const [reattachDialog, setReattachDialog] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const q = useStoreQuery(async (s) => {
    const doc = await s.documents.get(id);
    if (!doc) return null;
    const [anns, notes, progress, colls] = await Promise.all([s.annotations.listByDocument(id), s.notes.listForDocument(id), s.progress.forDocument(id), s.collections.collectionsFor('document', id)]);
    const byAnn = new Map<string, NoteRecord[]>();
    for (const n of notes) if (n.annotationId) (byAnn.get(n.annotationId) ?? byAnn.set(n.annotationId, []).get(n.annotationId)!).push(n);
    const tags = (await s.tags.listForEntity('document', id)).map((t) => t.name);
    return { doc, anns, notes, docNotes: notes.filter((n) => !n.annotationId), byAnn, progress, colls, tags };
  }, [id], ['documents', 'annotations', 'notes', 'readingProgress', 'collectionItems', 'collections', 'tags', 'taggings']);

  const data = q.data;
  const doc = data?.doc;
  const content = doc?.sourceType === 'manual' ? doc.content ?? '' : '';
  const readerText = useMemo(() => readerTextOf(content), [content]);
  const restoration = useMemo(() => (data && content ? restoreAll(readerText, data.anns) : null), [data, content, readerText]);

  // Record restoration outcomes so orphaned highlights are visible everywhere (idempotent writes).
  useEffect(() => {
    if (!data || !restoration) return;
    for (const a of data.anns) {
      const r = restoration.results.get(a.id);
      if (!r) continue;
      if (r.status === 'matched') { if (a.status !== 'active' || a.anchor?.strategy !== r.match.strategy) void store.annotations.reportRestoration(a.id, { status: 'active', confidence: r.match.score, strategy: r.match.strategy }); }
      else if (a.status !== 'orphaned') void store.annotations.reportRestoration(a.id, { status: 'orphaned' });
    }
  }, [data, restoration, store]);

  // Restore reading position, then save it as the user scrolls (debounced).
  const restored = useRef(false);
  useEffect(() => { restored.current = false; }, [id]);
  useEffect(() => {
    if (!doc || !content || restored.current) return;
    restored.current = true;
    const ratio = data?.progress?.scrollRatio ?? 0;
    if (ratio > 0 && !params.get('focus')) requestAnimationFrame(() => window.scrollTo({ top: ratio * (document.documentElement.scrollHeight - window.innerHeight) }));
  }, [doc, content, data?.progress?.scrollRatio, params]);
  const { call: saveProgress } = useDebouncedCallback((ratio: number) => { void store.progress.save(id, { scrollRatio: ratio, addSeconds: 5 }).catch(() => undefined); }, 1500);
  useEffect(() => {
    if (!content) return;
    const onScroll = () => { const max = document.documentElement.scrollHeight - window.innerHeight; if (max > 0) saveProgress(window.scrollY / max); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [content, saveProgress]);

  // Scroll to a focused highlight (from search results).
  useEffect(() => {
    if (!activeId) return;
    const esc = typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(activeId) : activeId.replace(/[^\w-]/g, '\\$&');
    const el = document.querySelector(`mark[data-ann="${esc}"]`) ?? document.getElementById(`ann-${activeId}`);
    el?.scrollIntoView?.({ block: 'center', behavior: settings.reducedMotion ? 'auto' : 'smooth' });
  }, [activeId, data?.anns.length, settings.reducedMotion]);

  const create = useCallback(async (type: AnnotationType, withNote = false) => {
    if (!pending) return;
    try {
      const { annotation } = await store.annotations.createAnnotation({ documentId: id, type, colour, anchor: pending.anchor });
      window.getSelection()?.removeAllRanges();
      setPending(null);
      setActiveId(annotation.id);
      if (withNote) setTab('highlights');
      toast({ message: `${type === 'highlight' ? 'Highlight' : type === 'underline' ? 'Underline' : 'Strikethrough'} saved`, actionLabel: 'Undo', onAction: () => void store.undo() });
    } catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Could not save the highlight', kind: 'error' }); }
  }, [pending, store, id, colour, toast]);

  const reattach = async (aid: string, anchor: TextAnchor) => {
    await store.annotations.reattach(aid, { ...anchor, confidence: 1, strategy: 'manual' });
    setReattachId(null); setReattachDialog(false); setPending(null);
    window.getSelection()?.removeAllRanges();
    toast({ message: 'Highlight reattached', kind: 'success' });
  };

  const reattachToCandidate = async (aid: string, range: { start: number; end: number }) => {
    const prev = data?.anns.find((a) => a.id === aid)?.anchor;
    const next = prev ? reattachAnchor(readerText, prev, range) : null;
    if (next) await reattach(aid, next);
  };

  const exportMd = async (mode: 'copy' | 'download') => {
    if (!data) return;
    const md = annotationsToMarkdown({ title: data.doc.title, url: data.doc.sourceType === 'manual' ? undefined : data.doc.canonicalUrl, tags: data.tags, annotations: data.anns, notesByAnnotation: data.byAnn, documentNotes: data.docNotes, palette: settings.palette, exportedAt: new Date().toISOString() });
    if (mode === 'download') downloadBlob(md, safeFilename(data.doc.title ?? 'notes', 'md'), 'text/markdown');
    else { try { await navigator.clipboard.writeText(md); toast({ message: 'Markdown copied', kind: 'success' }); } catch { toast({ message: 'Copy was blocked by the browser. Use Download instead.', kind: 'error' }); } }
  };

  const removeDoc = async () => {
    await store.documents.remove(id);
    setConfirmDelete(false);
    navigate('/');
    toast({ message: 'Source deleted', actionLabel: 'Undo', onAction: () => void store.undo() });
  };

  if (q.loading && !data) return <Skeleton lines={6} />;
  if (q.error) return <ErrorState message={q.error.message} onRetry={q.reload} />;
  if (!data || !doc) return <EmptyState icon="file" title="Source not found" action={<Link className="ukw-btn" to="/">Back to library</Link>}>It may have been deleted. Check Settings → Trash to restore it.</EmptyState>;

  const reattachAnn = data.anns.find((a) => a.id === reattachId);
  const progressPct = Math.round((data.progress?.scrollRatio ?? 0) * 100);

  const panel = (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div className="tabs" role="tablist">
        {([['highlights', `Highlights (${data.anns.length})`], ['notes', `Notes (${data.docNotes.length})`], ['info', 'Details']] as const).map(([t, label]) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab${tab === t ? ' is-active' : ''}`} onClick={() => setTab(t)}>{label}</button>
        ))}
      </div>
      {tab === 'highlights' ? (
        <>
          {doc.sourceType !== 'manual' ? <ManualHighlight documentId={id} /> : null}
          {data.anns.length === 0 ? (
            <EmptyState icon="highlight" title="No highlights yet">{doc.sourceType === 'manual' ? 'Select any passage in the text to highlight it.' : 'Highlight text on this page with the browser extension, or add a quote above.'}</EmptyState>
          ) : (
            <div className="anns">
              {data.anns.map((a) => {
                const r = restoration?.results.get(a.id);
                return <AnnotationCard key={a.id} a={a} notes={data.byAnn.get(a.id) ?? []} active={a.id === activeId} onFocus={() => setActiveId(a.id)} onGraph={() => setGraphFor(a.id)}
                  onReattach={content ? () => { setReattachId(a.id); setReattachDialog(true); } : undefined} ambiguousCount={r && r.status === 'ambiguous' ? r.candidates.length : 0} />;
              })}
            </div>
          )}
        </>
      ) : tab === 'notes' ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {data.docNotes.map((n) => (
            <div key={n.id} className="card section">
              <NoteEditor note={n} documentId={id} rows={4} />
              <div style={{ display: 'flex', gap: 4 }}>
                <IconButton size="sm" icon="pin" label={n.pinned ? 'Unpin' : 'Pin'} active={n.pinned} onClick={() => void store.notes.setPinned(n.id, !n.pinned)} />
                <IconButton size="sm" icon="graph" label="Add to graph" onClick={() => setGraphFor(`note:${n.id}`)} />
                <span className="grow" />
                <IconButton size="sm" icon="trash" label="Delete note" onClick={async () => { await store.notes.remove(n.id); toast({ message: 'Note deleted', actionLabel: 'Undo', onAction: () => void store.undo() }); }} />
              </div>
            </div>
          ))}
          <div className="card section"><NoteEditor key={`new-${data.docNotes.length}`} documentId={id} rows={4} placeholder="Write a note about this whole source…" /></div>
        </div>
      ) : (
        <div className="card section">
          <div className="kv"><div><b>{data.anns.length}</b>highlights</div><div><b>{data.docNotes.length}</b>notes</div><div><b>{Math.round((data.progress?.secondsRead ?? 0) / 60)}</b>min read</div></div>
          <dl style={{ display: 'grid', gap: 6, margin: 0 }}>
            <div><dt className="muted">Captured</dt><dd style={{ margin: 0 }}>{new Date(doc.createdAt).toLocaleString()}</dd></div>
            {doc.platform ? <div><dt className="muted">Platform</dt><dd style={{ margin: 0 }}>{doc.platform}</dd></div> : null}
            <div><dt className="muted">Collections</dt><dd style={{ margin: 0 }}>{data.colls.length ? data.colls.map((c) => c.name).join(', ') : 'None'}</dd></div>
          </dl>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button icon="folder" onClick={() => setCollOpen(true)}>Add to collection</Button>
            <Button icon="copy" onClick={() => void exportMd('copy')}>Copy Markdown</Button>
            <Button icon="download" onClick={() => void exportMd('download')}>Download .md</Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="doc">
      <header className="doc__head" style={{ display: 'grid', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
          <IconButton icon="chevron-left" label="Back to library" onClick={() => navigate('/')} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1>{doc.title || hostOf(doc.canonicalUrl) || 'Untitled'}</h1>
            {doc.sourceType !== 'manual' ? (isSafeLink(doc.canonicalUrl) ? <a href={doc.canonicalUrl} target="_blank" rel="noopener noreferrer" className="muted">{doc.canonicalUrl}</a> : <span className="muted">{doc.canonicalUrl}</span>) : <span className="muted">Text source</span>}
          </div>
          <IconButton icon="star" label={doc.isFavorite ? 'Remove from favorites' : 'Favorite'} active={doc.isFavorite} onClick={() => void store.documents.setFavorite(doc.id, !doc.isFavorite)} />
          <IconButton icon="archive" label={doc.isArchived ? 'Unarchive' : 'Archive'} active={doc.isArchived} onClick={() => void store.documents.setArchived(doc.id, !doc.isArchived)} />
          <IconButton icon="trash" label="Delete source" onClick={() => setConfirmDelete(true)} />
        </div>
        <TagEditor entityType="document" entityId={doc.id} />
        {content ? <div className="progressbar" role="progressbar" aria-label="Reading progress" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${progressPct}%` }} /></div> : null}
      </header>

      <div className={content ? 'doc--reader' : undefined} style={{ display: 'grid', gap: 18, gridTemplateColumns: content ? undefined : 'minmax(0,1fr)' }}>
        {content ? (
          <div style={{ minWidth: 0 }}>
            {reattachId && reattachAnn ? (
              <div className="bulkbar" style={{ marginBottom: 10 }}>
                <span className="grow">Select the right passage, then attach “{truncate(reattachAnn.anchor?.exact ?? '', 40)}” to it.</span>
                <Button size="sm" variant="primary" disabled={!pending} onClick={() => pending && void reattach(reattachId, pending.anchor)}>Reattach to selection</Button>
                <Button size="sm" variant="ghost" onClick={() => setReattachId(null)}>Cancel</Button>
              </div>
            ) : null}
            <Reader content={content} annotations={data.anns} activeId={activeId} onPick={(aid) => { setActiveId(aid); setTab('highlights'); }} onSelection={setPending} />
            {pending && !reattachId ? (
              <div className="selbar" role="toolbar" aria-label="Annotate selection">
                <Swatches value={colour} onPick={setColour} />
                <Button size="sm" variant="primary" icon="highlight" onClick={() => void create('highlight')}>Highlight</Button>
                <Button size="sm" icon="underline" onClick={() => void create('underline')}>Underline</Button>
                <Button size="sm" icon="strike" onClick={() => void create('strike')}>Strike</Button>
                <Button size="sm" icon="note" onClick={() => void create('highlight', true)}>+ Note</Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {panel}
      </div>

      <AddToGraphDialog open={!!graphFor} onClose={() => setGraphFor(null)} source={graphFor?.startsWith('note:') ? { noteId: graphFor.slice(5) } : { annotationId: graphFor ?? undefined }} />
      <CollectionPicker open={collOpen} onClose={() => setCollOpen(false)} entityType="document" entityIds={[id]} />
      <ReattachDialog open={reattachDialog} onClose={() => setReattachDialog(false)} annotation={reattachAnn} readerText={readerText} onChoose={(range) => reattachId && void reattachToCandidate(reattachId, range)} />
      <Dialog open={confirmDelete} title="Delete this source?" onClose={() => setConfirmDelete(false)} footer={<><Button variant="ghost" onClick={() => setConfirmDelete(false)}>Keep</Button><Button variant="danger" icon="trash" onClick={() => void removeDoc()}>Delete</Button></>}>
        <p>Its {plural(data.anns.length, 'highlight')} and notes move to Trash with it. You can restore them from Settings → Trash.</p>
      </Dialog>
    </div>
  );
}
