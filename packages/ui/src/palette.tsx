import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, type IconName } from './icons';
import { Kbd } from './components';

export interface PaletteCommand {
  id: string;
  title: string;
  group: string;
  icon: IconName;
  hint?: string;
  keywords?: string;
  run: () => void | Promise<void>;
}

export interface PaletteResult {
  key: string;
  title: string;
  icon: IconName;
  hint?: string;
  run: () => void | Promise<void>;
}

/**
 * Ranks a command for a query: 4/3 = every word is in the title, 2 = in title+group, 1 = only via keywords, 0 = no match.
 * Keywords must never outrank a real title match (e.g. "theme: dark" must put "Theme: dark" first).
 */
export function scoreCommand(c: Pick<PaletteCommand, 'title' | 'group' | 'keywords'>, q: string): number {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  const title = c.title.toLowerCase();
  const withGroup = `${title} ${c.group.toLowerCase()}`;
  const all = `${withGroup} ${(c.keywords ?? '').toLowerCase()}`;
  if (words.every((w) => title.includes(w))) return title.startsWith(words[0]!) ? 4 : 3;
  if (words.every((w) => withGroup.includes(w))) return 2;
  if (words.every((w) => all.includes(w))) return 1;
  return 0;
}

export function rankCommands(commands: PaletteCommand[], query: string): PaletteCommand[] {
  return commands
    .map((c, i) => ({ c, i, score: scoreCommand(c, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
}

/** Presentational command palette: the host supplies commands and (optionally) live search results. */
export function PaletteView({ open, onClose, commands, results = [], onQueryChange, placeholder = 'Type a command or search everything…' }: {
  open: boolean;
  onClose: () => void;
  commands: PaletteCommand[];
  results?: PaletteResult[];
  onQueryChange?: (q: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); onQueryChange?.(''); setTimeout(() => inputRef.current?.focus(), 0); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  type Item = { key: string; title: string; group: string; icon: IconName; hint?: string; run: () => void | Promise<void> };
  const items: Item[] = useMemo(() => [
    ...rankCommands(commands, query).map((c) => ({ key: c.id, title: c.title, group: c.group, icon: c.icon, hint: c.hint, run: c.run })),
    ...results.map((r) => ({ key: r.key, title: r.title, group: 'Results', icon: r.icon, hint: r.hint, run: r.run })),
  ], [commands, results, query]);

  useEffect(() => { setActive((a) => Math.min(a, Math.max(0, items.length - 1))); }, [items.length]);
  useEffect(() => { listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' }); }, [active]);

  if (!open) return null;
  const choose = (i: number) => { const it = items[i]; if (!it) return; onClose(); void it.run(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (items.length ? (a + 1) % items.length : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    e.stopPropagation(); // keep typing away from the host page's shortcuts
  };

  let lastGroup = '';
  return (
    <div className="ukw-overlay overlay--top" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey}>
        <input ref={inputRef} className="palette__input" placeholder={placeholder} value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); onQueryChange?.(e.target.value); }}
          role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[active] ? `pal-${items[active]!.key}` : undefined} />
        <ul id="palette-list" className="palette__list" role="listbox" ref={listRef}>
          {items.length === 0 ? <li className="palette__group">No matches</li> : null}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? <li key={`g-${it.group}`} className="palette__group" role="presentation">{it.group}</li> : null;
            lastGroup = it.group;
            return [header, (
              <li key={it.key} id={`pal-${it.key}`} role="option" aria-selected={i === active} className="palette__item" onMouseMove={() => setActive(i)} onClick={() => choose(i)}>
                <Icon name={it.icon} size={18} />
                <span>{it.title}</span>
                {it.hint ? <span className="palette__hint">{it.hint}</span> : null}
              </li>
            )];
          })}
        </ul>
        <div className="palette__foot"><span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span><span><Kbd>Enter</Kbd> run</span><span><Kbd>Esc</Kbd> close</span></div>
      </div>
    </div>
  );
}
