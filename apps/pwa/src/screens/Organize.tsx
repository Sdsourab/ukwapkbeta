import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Chip, Dialog, EmptyState, Field, Icon, IconButton, Segmented, TextInput, useToast } from '@ukw/ui';
import { UkwError, type CollectionKind } from '@ukw/domain';
import type { CollectionNode } from '@ukw/database';
import { plural } from '../lib/format';
import { useStore, useStoreQuery } from '../store-context';

function flatten(nodes: CollectionNode[], depth = 0): Array<CollectionNode & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

function CollectionDialog({ open, onClose, editing, tree }: { open: boolean; onClose: () => void; editing?: CollectionNode; tree: CollectionNode[] }) {
  const store = useStore();
  const toast = useToast();
  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<CollectionKind>(editing?.kind ?? 'collection');
  const [parent, setParent] = useState<string>(editing?.parentId ?? '');
  const [err, setErr] = useState('');
  const options = flatten(tree).filter((c) => c.id !== editing?.id);
  const save = async () => {
    try {
      if (editing) { await store.collections.update(editing.id, { name: name.trim(), kind }); if ((editing.parentId ?? '') !== parent) await store.collections.move(editing.id, parent || null); }
      else await store.collections.createCollection({ name, kind, parentId: parent || null });
      onClose();
    } catch (e) { const m = e instanceof UkwError ? e.message : 'Could not save'; setErr(m); toast({ message: m, kind: 'error' }); }
  };
  return (
    <Dialog open={open} title={editing ? 'Edit collection' : 'New collection'} onClose={onClose} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => void save()} disabled={!name.trim()}>Save</Button></>}>
      <Field label="Name" error={err}>{(id, d) => <TextInput id={id} aria-describedby={d} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void save(); }} autoFocus />}</Field>
      <Segmented label="Type" value={kind} onChange={setKind} options={[{ value: 'collection', label: 'Collection', icon: 'book' }, { value: 'folder', label: 'Folder', icon: 'folder' }]} />
      <Field label="Inside">{(id) => (
        <select id={id} className="ukw-input" value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">Top level</option>
          {options.map((c) => <option key={c.id} value={c.id}>{'— '.repeat(c.depth)}{c.name}</option>)}
        </select>
      )}</Field>
    </Dialog>
  );
}

function CollectionItems({ id }: { id: string }) {
  const store = useStore();
  const q = useStoreQuery(async (s) => {
    const items = await s.collections.listItems(id);
    return Promise.all(items.map(async (i) => {
      const t = i.entityType;
      const rec = t === 'document' ? await s.documents.get(i.entityId) : t === 'graph' ? await s.graphs.get(i.entityId) : t === 'note' ? await s.notes.get(i.entityId) : t === 'annotation' ? await s.annotations.get(i.entityId) : t === 'task' ? await s.tasks.get(i.entityId) : await s.references.get(i.entityId);
      const title = rec ? ('title' in rec && rec.title ? String(rec.title) : 'anchor' in rec && rec.anchor ? rec.anchor.exact : 'body' in rec ? String(rec.body).slice(0, 60) : 'Untitled') : '(missing)';
      const href = t === 'document' ? `/doc/${i.entityId}` : t === 'graph' ? `/graphs/${i.entityId}` : t === 'annotation' && rec && 'documentId' in rec ? `/doc/${rec.documentId}?focus=${i.entityId}` : undefined;
      return { item: i, title, href, exists: !!rec };
    }));
  }, [id], ['collectionItems', 'documents', 'graphs', 'notes', 'annotations']);
  if (!q.data) return null;
  if (q.data.length === 0) return <p className="muted">Empty. Add sources from the Library (Select → Collection).</p>;
  return (
    <div className="rows">
      {q.data.map(({ item, title, href, exists }) => (
        <div key={item.id} className="card doclink" style={{ padding: '4px 8px 4px 14px' }}>
          {href && exists ? <Link to={href} className="row__title" style={{ textDecoration: 'none', color: 'inherit' }}>{title}</Link> : <span className="row__title muted">{title}</span>}
          <IconButton size="sm" icon="x" label={`Remove ${title} from collection`} onClick={() => void store.collections.removeItem(id, item.entityType, item.entityId)} />
        </div>
      ))}
    </div>
  );
}

export function Organize() {
  const store = useStore();
  const toast = useToast();
  const tree = useStoreQuery((s) => s.collections.tree(), [], ['collections', 'collectionItems']);
  const tags = useStoreQuery((s) => s.tags.listWithCounts(), [], ['tags', 'taggings']);
  const [dialog, setDialog] = useState<{ open: boolean; editing?: CollectionNode }>({ open: false });
  const [open, setOpen] = useState<string>('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const flat = flatten(tree.data ?? []);

  const delCollection = async (c: CollectionNode) => {
    await store.collections.remove(c.id);
    toast({ message: `Deleted “${c.name}”. Its sources are untouched.`, actionLabel: 'Undo', onAction: () => void store.undo() });
  };
  const renameTag = async () => {
    if (!renaming) return;
    try { await store.tags.rename(renaming.id, renaming.name); setRenaming(null); } catch (e) { toast({ message: e instanceof UkwError ? e.message : 'Could not rename', kind: 'error' }); }
  };

  return (
    <>
      <div className="pagehead"><div><h1>Organize</h1><p>Collections and folders group your sources; tags cut across everything.</p></div><Button variant="primary" icon="plus" onClick={() => setDialog({ open: true })}>New collection</Button></div>

      <section aria-labelledby="coll-h" className="settings">
        <h2 id="coll-h" style={{ fontSize: '1.2rem' }}>Collections & folders</h2>
        {flat.length === 0 ? <EmptyState icon="folder" title="No collections yet" action={<Button variant="primary" icon="plus" onClick={() => setDialog({ open: true })}>Create one</Button>}>Collections are the quickest way to gather the sources for a paper, a topic or a project.</EmptyState> : (
          <div className="rows">
            {flat.map((c) => (
              <div key={c.id} style={{ marginLeft: c.depth * 18 }}>
                <div className="card doclink" style={{ padding: '6px 8px 6px 10px' }}>
                  <button type="button" className="ukw-btn ukw-btn--ghost" style={{ justifyContent: 'flex-start', gap: 10 }} aria-expanded={open === c.id} onClick={() => setOpen(open === c.id ? '' : c.id)}>
                    <Icon name={c.kind === 'folder' ? 'folder' : 'book'} size={18} /> <strong>{c.name}</strong> <span className="muted">{plural(c.itemCount, 'item')}</span>
                    <Icon name={open === c.id ? 'chevron-up' : 'chevron-down'} size={16} />
                  </button>
                  <span style={{ display: 'flex' }}>
                    <IconButton size="sm" icon="edit" label={`Edit ${c.name}`} onClick={() => setDialog({ open: true, editing: c })} />
                    <IconButton size="sm" icon="trash" label={`Delete ${c.name}`} onClick={() => void delCollection(c)} />
                  </span>
                </div>
                {open === c.id ? <div style={{ margin: '8px 0 4px 14px' }}><CollectionItems id={c.id} /></div> : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="tags-h" className="settings">
        <h2 id="tags-h" style={{ fontSize: '1.2rem' }}>Tags</h2>
        {(tags.data?.length ?? 0) === 0 ? <EmptyState icon="tag" title="No tags yet">Add tags on any source or highlight. They show up here with usage counts.</EmptyState> : (
          <div className="rows">
            {tags.data!.map((t) => (
              <div key={t.id} className="card doclink" style={{ padding: '6px 8px 6px 14px' }}>
                {renaming?.id === t.id ? (
                  <TextInput aria-label="Tag name" value={renaming.name} autoFocus onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') void renameTag(); if (e.key === 'Escape') setRenaming(null); }} onBlur={() => void renameTag()} />
                ) : (
                  <Link to={`/search?tag=${t.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', gap: 10, alignItems: 'center' }}><Chip label={t.name} /><span className="muted">{plural(t.count, 'use')}</span></Link>
                )}
                <span style={{ display: 'flex' }}>
                  <IconButton size="sm" icon="edit" label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })} />
                  <IconButton size="sm" icon="trash" label={`Delete tag ${t.name}`} onClick={async () => { await store.tags.remove(t.id); toast({ message: `Deleted tag “${t.name}”`, actionLabel: 'Undo', onAction: () => void store.undo() }); }} />
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
      {dialog.open ? <CollectionDialog key={dialog.editing?.id ?? 'new'} open onClose={() => setDialog({ open: false })} editing={dialog.editing} tree={tree.data ?? []} /> : null}
    </>
  );
}
