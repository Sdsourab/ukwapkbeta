import { useState } from 'react';
import { Button, Dialog, EmptyState, Field, TextInput, useToast } from '@ukw/ui';
import type { CollectionEntityType } from '@ukw/domain';
import { UkwError } from '@ukw/domain';
import { useNavigate } from 'react-router-dom';
import { useStore, useStoreQuery } from '../store-context';
import type { CollectionNode } from '@ukw/database';

function flatten(nodes: CollectionNode[], depth = 0): Array<CollectionNode & { depth: number }> {
  return nodes.flatMap((n) => [{ ...n, depth }, ...flatten(n.children, depth + 1)]);
}

/** Adds the given entities to a collection (or a new one). */
export function CollectionPicker({ open, onClose, entityType, entityIds, onDone }: { open: boolean; onClose: () => void; entityType: CollectionEntityType; entityIds: string[]; onDone?: () => void }) {
  const store = useStore();
  const toast = useToast();
  const tree = useStoreQuery((s) => s.collections.tree(), [], ['collections', 'collectionItems']);
  const [name, setName] = useState('');
  const flat = flatten(tree.data ?? []);

  const addTo = async (collectionId: string, label: string) => {
    try {
      await store.batch('Add to collection', async () => { for (const id of entityIds) await store.collections.addItem(collectionId, entityType, id); });
      toast({ message: `Added ${entityIds.length} to “${label}”`, kind: 'success' });
      onDone?.(); onClose();
    } catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Could not add to collection', kind: 'error' }); }
  };
  const create = async () => {
    const n = name.trim();
    if (!n) return;
    try { const c = await store.collections.createCollection({ name: n }); setName(''); await addTo(c.id, c.name); } catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Could not create collection', kind: 'error' }); }
  };

  return (
    <Dialog open={open} title="Add to collection" onClose={onClose}>
      {flat.length === 0 ? <EmptyState icon="folder" title="No collections yet">Create your first one below.</EmptyState> : (
        <div className="rows" role="list">
          {flat.map((c) => (
            <button key={c.id} type="button" className="ukw-btn" style={{ justifyContent: 'flex-start', paddingLeft: 14 + c.depth * 18 }} onClick={() => void addTo(c.id, c.name)}>
              {c.kind === 'folder' ? '📁 ' : ''}{c.name} <span className="muted">· {c.itemCount}</span>
            </button>
          ))}
        </div>
      )}
      <Field label="New collection">
        {(id) => (
          <div style={{ display: 'flex', gap: 8 }}>
            <TextInput id={id} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} placeholder="e.g. Thesis chapter 2" />
            <Button variant="primary" onClick={() => void create()} disabled={!name.trim()}>Create</Button>
          </div>
        )}
      </Field>
    </Dialog>
  );
}

/** Adds an annotation or note to a graph as a source-linked node (FR-GRAPH-003). */
export function AddToGraphDialog({ open, onClose, source }: { open: boolean; onClose: () => void; source: { annotationId?: string; noteId?: string; documentId?: string } }) {
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const graphs = useStoreQuery((s) => s.graphs.list(), [], ['graphs']);
  const list = [...(graphs.data ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  const add = async (graphId: string, title: string) => {
    try {
      const existing = await store.graphs.load(graphId);
      const maxX = existing.nodes.length ? Math.max(...existing.nodes.map((n) => n.position.x)) : -300;
      const node = await store.graphs.addSourceNode(graphId, source, { x: maxX + 300, y: 0 });
      toast({ message: `Added to “${title}”`, kind: 'success', actionLabel: 'Open graph', onAction: () => navigate(`/graphs/${graphId}?node=${node.id}`) });
      onClose();
    } catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Could not add to graph', kind: 'error' }); }
  };
  const createAndAdd = async () => { const g = await store.graphs.createGraph({ title: 'New graph' }); await add(g.id, g.title); };

  return (
    <Dialog open={open} title="Add to graph" onClose={onClose} footer={<Button icon="plus" onClick={() => void createAndAdd()}>New graph</Button>}>
      {list.length === 0 ? <EmptyState icon="graph" title="No graphs yet">Create one and this item becomes its first node.</EmptyState> : (
        <div className="rows">
          {list.map((g) => <button key={g.id} type="button" className="ukw-btn" style={{ justifyContent: 'flex-start' }} onClick={() => void add(g.id, g.title)}>{g.title}</button>)}
        </div>
      )}
    </Dialog>
  );
}
