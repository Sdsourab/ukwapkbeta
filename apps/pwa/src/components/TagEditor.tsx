import { useState } from 'react';
import { Chip, TextInput, useToast } from '@ukw/ui';
import type { Taggable } from '@ukw/domain';
import { UkwError } from '@ukw/domain';
import { useStore, useStoreQuery } from '../store-context';

/** Inline tag chips with add/remove. Suggestions come from existing tags. */
export function TagEditor({ entityType, entityId, compact }: { entityType: Taggable; entityId: string; compact?: boolean }) {
  const store = useStore();
  const toast = useToast();
  const [draft, setDraft] = useState('');
  const mine = useStoreQuery((s) => s.tags.listForEntity(entityType, entityId), [entityType, entityId], ['tags', 'taggings']);
  const all = useStoreQuery((s) => s.tags.list(), [], ['tags']);
  const names = (mine.data ?? []).map((t) => t.name);
  const listId = `taglist-${entityType}-${entityId}`;

  const commit = async (next: string[]) => {
    try { await store.tags.setForEntity(entityType, entityId, next); } catch (err) { toast({ message: err instanceof UkwError ? err.message : 'Could not update tags', kind: 'error' }); }
  };
  const add = async () => {
    const parts = draft.split(',').map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setDraft('');
    await commit([...new Set([...names, ...parts])]);
  };

  return (
    <div className="tagedit" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
      {(mine.data ?? []).map((t) => <Chip key={t.id} label={t.name} onRemove={() => void commit(names.filter((n) => n !== t.name))} />)}
      <TextInput
        aria-label="Add tag" list={listId} placeholder={names.length ? '+ tag' : 'Add tags (comma separated)'}
        value={draft} maxLength={60} style={{ width: compact ? 110 : 190, minHeight: 32, padding: '4px 10px' }}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); void add(); } }}
        onBlur={() => void add()}
      />
      <datalist id={listId}>{(all.data ?? []).map((t) => <option key={t.id} value={t.name} />)}</datalist>
    </div>
  );
}
