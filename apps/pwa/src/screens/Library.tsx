import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Chip, Dialog, EmptyState, ErrorState, Field, Icon, IconButton, Segmented, Skeleton, TextArea, TextInput, useToast } from '@ukw/ui';
import { UkwError, type DocumentRecord } from '@ukw/domain';
import { CollectionPicker } from '../components/Pickers';
import { hostOf, plural, timeAgo } from '../lib/format';
import { useStore, useStoreQuery } from '../store-context';

type View = 'all' | 'favorites' | 'archived';
type Sort = 'recent' | 'title' | 'annotated';

function flattenIds(nodes: Array<{ id: string; name: string; children: unknown[] }>): Array<{ id: string; name: string }> {
  const out: Array<{ id: string; name: string }> = [];
  const walk = (list: Array<{ id: string; name: string; children: unknown[] }>) => list.forEach((n) => { out.push({ id: n.id, name: n.name }); walk(n.children as typeof list); });
  walk(nodes);
  return out;
}

function NewSourceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    try {
      const doc = await store.documents.createManual({ title, content: text });
      toast({ message: 'Source created', kind: 'success' });
      setTitle(''); setText(''); setError(''); onClose();
      window.location.hash = `#/doc/${doc.id}`;
    } catch (err) { setError(err instanceof UkwError ? err.message : 'Could not create the source'); }
  };
  return (
    <Dialog open={open} title="New text source" onClose={onClose} wide footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={save}>Create</Button></>}>
      <p className="muted">Paste an article, chapter or your own writing to read, highlight and annotate it here.</p>
      <Field label="Title" error={error}>{(id, d) => <TextInput id={id} aria-describedby={d} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />}</Field>
      <Field label="Text">{(id) => <TextArea id={id} rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste text here. Separate paragraphs with a blank line." />}</Field>
    </Dialog>
  );
}

export function Library() {
  const store = useStore();
  const toast = useToast();
  const [view, setView] = useState<View>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [filter, setFilter] = useState('');
  const [collectionId, setCollectionId] = useState<string>('');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);

  const q = useStoreQuery(async (s) => {
    const [docs, counts, tree] = await Promise.all([s.documents.list(), s.annotations.countsByDocument(), s.collections.tree()]);
    const inCollection = collectionId ? new Set((await s.collections.listItems(collectionId)).filter((i) => i.entityType === 'document').map((i) => i.entityId)) : null;
    return { docs, counts, collections: flattenIds(tree), inCollection };
  }, [collectionId], ['documents', 'annotations', 'collections', 'collectionItems']);

  const visible = useMemo(() => {
    if (!q.data) return [];
    const needle = filter.trim().toLowerCase();
    let list = q.data.docs.filter((d) => (view === 'archived' ? d.isArchived : !d.isArchived) && (view !== 'favorites' || d.isFavorite));
    if (q.data.inCollection) list = list.filter((d) => q.data!.inCollection!.has(d.id));
    if (needle) list = list.filter((d) => `${d.title ?? ''} ${d.canonicalUrl}`.toLowerCase().includes(needle));
    const counts = q.data.counts;
    return [...list].sort((a, b) =>
      sort === 'title' ? (a.title ?? a.canonicalUrl).localeCompare(b.title ?? b.canonicalUrl)
      : sort === 'annotated' ? (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
      : (b.lastVisitedAt ?? b.updatedAt).localeCompare(a.lastVisitedAt ?? a.updatedAt));
  }, [q.data, view, sort, filter]);

  const ids = [...selected];
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const exitSelect = () => { setSelecting(false); setSelected(new Set()); };

  const bulk = async (label: string, fn: () => Promise<unknown>, undoable = true) => {
    try {
      await store.batch(label, fn);
      toast({ message: `${label}: ${plural(ids.length, 'source')}`, kind: 'success', actionLabel: undoable ? 'Undo' : undefined, onAction: undoable ? () => void store.undo() : undefined });
      exitSelect();
    } catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Action failed', kind: 'error' }); }
  };

  return (
    <>
      <div className="pagehead">
        <div>
          <h1>Library</h1>
          <p>{q.data ? plural(q.data.docs.filter((d) => !d.isArchived).length, 'source') : 'Your sources'} · everything is saved on this device</p>
        </div>
        <div className="toolbar">
          <Button icon="plus" onClick={() => setNewOpen(true)}>Paste text</Button>
          <Button variant={selecting ? 'primary' : 'secondary'} icon="check" onClick={() => (selecting ? exitSelect() : setSelecting(true))}>{selecting ? 'Done' : 'Select'}</Button>
        </div>
      </div>

      <div className="toolbar">
        <TextInput aria-label="Filter sources" type="search" placeholder="Filter by title or address" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <Segmented label="View" value={view} onChange={setView} options={[{ value: 'all', label: 'All' }, { value: 'favorites', label: 'Favorites', icon: 'star' }, { value: 'archived', label: 'Archived', icon: 'archive' }]} />
        <label className="muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>Sort
          <select className="ukw-input" style={{ width: 'auto', minHeight: 36 }} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="recent">Recently opened</option><option value="title">Title</option><option value="annotated">Most annotated</option>
          </select>
        </label>
      </div>
      {q.data && q.data.collections.length > 0 ? (
        <div className="filters" role="group" aria-label="Collections">
          <Chip label="All collections" selected={!collectionId} onClick={() => setCollectionId('')} />
          {q.data.collections.map((c) => <Chip key={c.id} label={c.name} selected={collectionId === c.id} onClick={() => setCollectionId(collectionId === c.id ? '' : c.id)} />)}
        </div>
      ) : null}

      {selecting && selected.size > 0 ? (
        <div className="bulkbar" role="toolbar" aria-label="Bulk actions">
          <strong>{selected.size} selected</strong><span className="grow" />
          <Button size="sm" icon="star" onClick={() => void bulk('Favorited', () => store.documents.bulkUpdate(ids, { isFavorite: true }))}>Favorite</Button>
          <Button size="sm" icon="folder" onClick={() => setPickOpen(true)}>Collection</Button>
          <Button size="sm" icon="tag" onClick={() => setTagOpen(true)}>Tag</Button>
          <Button size="sm" icon="archive" onClick={() => void bulk(view === 'archived' ? 'Unarchived' : 'Archived', () => store.documents.bulkUpdate(ids, { isArchived: view !== 'archived' }))}>{view === 'archived' ? 'Unarchive' : 'Archive'}</Button>
          <Button size="sm" variant="danger" icon="trash" onClick={() => void bulk('Deleted', async () => { for (const id of ids) await store.documents.remove(id); })}>Delete</Button>
        </div>
      ) : null}

      {q.loading && !q.data ? <Skeleton lines={5} /> : q.error ? <ErrorState message={q.error.message} onRetry={q.reload} /> : visible.length === 0 ? (
        q.data && q.data.docs.length === 0 ? (
          <EmptyState icon="library" title="Your library is empty" action={<Button variant="primary" icon="plus" onClick={() => setNewOpen(true)}>Paste text to start</Button>}>
            Sources you annotate with the browser extension appear here, along with anything you capture or share to this app.
          </EmptyState>
        ) : <EmptyState icon="search" title="Nothing matches">Try clearing the filter or switching views.</EmptyState>
      ) : (
        <div className="rows" role="list">
          {visible.map((d: DocumentRecord) => {
            const n = q.data!.counts.get(d.id) ?? 0;
            const inner = (
              <>
                <div className="row__icon"><Icon name={d.sourceType === 'conversation' ? 'sticky' : d.sourceType === 'manual' ? 'note' : d.sourceType === 'pdf' ? 'file' : 'link'} size={20} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="row__title">{d.title || hostOf(d.canonicalUrl) || 'Untitled'}</div>
                  <div className="row__meta">
                    <span>{d.sourceType === 'manual' ? 'Text source' : hostOf(d.canonicalUrl)}</span>
                    <span>{plural(n, 'highlight')}</span>
                    <span>{timeAgo(d.lastVisitedAt ?? d.updatedAt)}</span>
                    {d.platform ? <span className="badge">{d.platform}</span> : null}
                    {d.isFavorite ? <span className="badge badge--accent">Favorite</span> : null}
                  </div>
                </div>
              </>
            );
            return selecting ? (
              <div key={d.id} className="card" role="listitem">
                <label className="selrow">
                  <input className="row__check" type="checkbox" checked={selected.has(d.id)} onChange={() => toggle(d.id)} aria-label={`Select ${d.title ?? d.canonicalUrl}`} />
                  {inner}
                </label>
              </div>
            ) : (
              <div key={d.id} className="card doclink" role="listitem">
                <Link to={`/doc/${d.id}`} className="doclink__main">{inner}</Link>
                <IconButton icon="star" label={d.isFavorite ? 'Remove from favorites' : 'Add to favorites'} active={d.isFavorite} onClick={() => void store.documents.setFavorite(d.id, !d.isFavorite)} />
              </div>
            );
          })}
        </div>
      )}

      <NewSourceDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <CollectionPicker open={pickOpen} onClose={() => setPickOpen(false)} entityType="document" entityIds={ids} onDone={exitSelect} />
      <Dialog open={tagOpen} title={`Tag ${plural(ids.length, 'source')}`} onClose={() => setTagOpen(false)}>
        <BulkTagger ids={ids} onDone={() => { setTagOpen(false); exitSelect(); }} />
      </Dialog>
    </>
  );
}

function BulkTagger({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const store = useStore();
  const toast = useToast();
  const [value, setValue] = useState('');
  const apply = async () => {
    const names = value.split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    try {
      await store.batch('Tag sources', async () => {
        for (const n of names) { const tag = await store.tags.ensure(n); for (const id of ids) await store.tags.attach(tag.id, 'document', id); }
      });
      toast({ message: 'Tags added', kind: 'success', actionLabel: 'Undo', onAction: () => void store.undo() });
      onDone();
    } catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Could not add tags', kind: 'error' }); }
  };
  return (
    <>
      <Field label="Tags" hint="Comma separated. Added to every selected source.">{(id, d) => <TextInput id={id} aria-describedby={d} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void apply(); }} autoFocus />}</Field>
      <div><Button variant="primary" onClick={() => void apply()} disabled={!value.trim()}>Add tags</Button></div>
    </>
  );
}

