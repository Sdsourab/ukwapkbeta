import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Chip, EmptyState, Icon, Skeleton, TextInput } from '@ukw/ui';
import type { SearchEntityType, SearchResult } from '@ukw/domain';
import { plural, timeAgo } from '../lib/format';
import { useSettings, useStore, useStoreQuery } from '../store-context';

const TYPES: Array<{ value: SearchEntityType; label: string }> = [
  { value: 'annotation', label: 'Highlights' }, { value: 'note', label: 'Notes' }, { value: 'document', label: 'Sources' },
  { value: 'graph', label: 'Graphs' }, { value: 'node', label: 'Graph nodes' }, { value: 'reference', label: 'References' },
  { value: 'task', label: 'Tasks' }, { value: 'project', label: 'Projects' },
];

export function linkFor(r: SearchResult): string {
  if (r.entityType === 'graph') return `/graphs/${r.entityId}`;
  if (r.entityType === 'node' && r.graphId) return `/graphs/${r.graphId}?node=${r.entityId}`;
  if (r.entityType === 'document') return `/doc/${r.entityId}`;
  if (r.entityType === 'project') return `/research/${r.entityId}`;
  if (r.documentId) return `/doc/${r.documentId}?focus=${r.entityId}`;
  return '/search';
}

export function SearchScreen() {
  const store = useStore();
  const settings = useSettings();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [types, setTypes] = useState<SearchEntityType[]>([]);
  const [colour, setColour] = useState('');
  const [tagIds, setTagIds] = useState<string[]>(params.get('tag') ? [params.get('tag')!] : []);
  const [debounced, setDebounced] = useState(query);
  const tags = useStoreQuery((s) => s.tags.listWithCounts(), [], ['tags', 'taggings']);

  useEffect(() => { const t = setTimeout(() => setDebounced(query), 150); return () => clearTimeout(t); }, [query]);
  useEffect(() => { const next = new URLSearchParams(params); if (debounced) next.set('q', debounced); else next.delete('q'); if (next.toString() !== params.toString()) setParams(next, { replace: true }); }, [debounced]); // eslint-disable-line react-hooks/exhaustive-deps

  const res = useStoreQuery(
    (s) => s.search.search({ query: debounced, types: types.length ? types : undefined, colour: colour || undefined, tagIds: tagIds.length ? tagIds : undefined, limit: 200 }),
    [debounced, types.join(), colour, tagIds.join()],
  );
  const hasCriteria = debounced.trim() || types.length || colour || tagIds.length;
  const results = useMemo(() => (hasCriteria ? res.data ?? [] : []), [hasCriteria, res.data]);
  void store;

  return (
    <>
      <div className="pagehead"><div><h1>Search</h1><p>Highlights, notes, sources, graphs and more, all searched on this device. Use “quotes” for exact phrases.</p></div></div>
      <TextInput aria-label="Search everything" type="search" autoFocus placeholder="Search everything…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 'none', fontSize: '1.05rem', minHeight: 48 }} />
      <div className="filters" role="group" aria-label="Filter by type">
        {TYPES.map((t) => <Chip key={t.value} label={t.label} selected={types.includes(t.value)} onClick={() => setTypes((l) => (l.includes(t.value) ? l.filter((x) => x !== t.value) : [...l, t.value]))} />)}
      </div>
      <div className="filters" role="group" aria-label="Filter by colour">
        {settings.palette.map((c) => <Chip key={c.id} label={c.label} colour={c.hex} selected={colour.toLowerCase() === c.hex.toLowerCase()} onClick={() => setColour(colour.toLowerCase() === c.hex.toLowerCase() ? '' : c.hex)} />)}
      </div>
      {(tags.data?.length ?? 0) > 0 ? (
        <div className="filters" role="group" aria-label="Filter by tag">
          {tags.data!.slice(0, 24).map((t) => <Chip key={t.id} label={`#${t.name} · ${t.count}`} selected={tagIds.includes(t.id)} onClick={() => setTagIds((l) => (l.includes(t.id) ? l.filter((x) => x !== t.id) : [...l, t.id]))} />)}
        </div>
      ) : null}

      {!hasCriteria ? <EmptyState icon="search" title="Find anything you saved">Type a word, a phrase from a highlight, a tag, or pick a filter.</EmptyState>
        : res.loading && !res.data ? <Skeleton lines={4} />
        : results.length === 0 ? <EmptyState icon="search" title="No results">Try fewer words, a different spelling, or remove a filter.</EmptyState>
        : (
          <>
            <p className="muted" aria-live="polite">{plural(results.length, 'result')}</p>
            <div className="results">
              {results.map((r) => (
                <Link key={`${r.entityType}-${r.entityId}`} to={linkFor(r)} className="card result">
                  <div className="result__title">
                    {r.colour ? <span className="dot" style={{ background: r.colour }} aria-hidden /> : <Icon name={r.entityType === 'graph' || r.entityType === 'node' ? 'graph' : r.entityType === 'note' ? 'note' : r.entityType === 'document' ? 'file' : r.entityType === 'reference' ? 'book' : 'highlight'} size={16} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</span>
                    <span className="badge">{TYPES.find((t) => t.value === r.entityType)?.label ?? r.entityType}</span>
                  </div>
                  {r.snippet && r.snippet !== r.title ? <div className="result__snippet">{r.snippet}</div> : null}
                  <div className="row__meta"><span>{timeAgo(r.updatedAt)}</span></div>
                </Link>
              ))}
            </div>
          </>
        )}
    </>
  );
}
