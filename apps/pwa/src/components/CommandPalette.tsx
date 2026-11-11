import { useEffect, useMemo, useState } from 'react';
import { PaletteView, scoreCommand, type PaletteCommand, type PaletteResult } from '@ukw/ui';
import type { SearchResult } from '@ukw/domain';
import { useStore } from '../store-context';

export type Command = PaletteCommand;
export { scoreCommand };

/** PWA palette: shared presentation + live results from the local search index. */
export function CommandPalette({ open, onClose, commands, onOpenResult }: { open: boolean; onClose: () => void; commands: Command[]; onOpenResult: (r: SearchResult) => void }) {
  const store = useStore();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    if (!open || query.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(() => { store.search.search({ query, limit: 6 }).then((r) => { if (!cancelled) setResults(r); }).catch(() => { if (!cancelled) setResults([]); }); }, 120);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, open, store]);

  const mapped: PaletteResult[] = useMemo(() => results.map((r) => ({
    key: `r-${r.entityType}-${r.entityId}`,
    title: r.title.slice(0, 90) || 'Untitled',
    icon: r.entityType === 'graph' || r.entityType === 'node' ? 'graph' : r.entityType === 'note' ? 'note' : r.entityType === 'document' ? 'file' : 'highlight',
    hint: r.entityType,
    run: () => onOpenResult(r),
  })), [results, onOpenResult]);

  return <PaletteView open={open} onClose={onClose} commands={commands} results={mapped} onQueryChange={setQuery} />;
}
