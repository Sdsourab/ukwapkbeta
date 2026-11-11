import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DataStore } from '@ukw/database';
import { DEFAULT_SETTINGS, type SyncEntityType, type UkwSettings } from '@ukw/domain';

const StoreContext = createContext<DataStore | null>(null);

export function StoreProvider({ store, children }: { store: DataStore; children: ReactNode }) {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): DataStore {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside <StoreProvider>');
  return s;
}

export interface QueryState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  reload: () => void;
}

/**
 * Runs an async query against the store and re-runs it whenever a relevant change event arrives
 * (from this tab or another one). Stale responses are discarded.
 * `entities` limits re-queries to the given entity types; omit to refresh on any change.
 */
export function useStoreQuery<T>(query: (store: DataStore) => Promise<T>, deps: readonly unknown[], entities?: readonly SyncEntityType[]): QueryState<T> {
  const store = useStore();
  const [state, setState] = useState<{ data: T | undefined; loading: boolean; error: Error | null }>({ data: undefined, loading: true, error: null });
  const seq = useRef(0);
  const queryRef = useRef(query);
  queryRef.current = query;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entityKey = entities?.join(',') ?? '*';

  const run = useCallback(() => {
    const id = ++seq.current;
    queryRef.current(store).then(
      (data) => { if (id === seq.current) setState({ data, loading: false, error: null }); },
      (err: unknown) => { if (id === seq.current) setState((s) => ({ data: s.data, loading: false, error: err instanceof Error ? err : new Error(String(err)) })); },
    );
  }, [store]);

  useEffect(() => {
    setState((s) => (s.loading ? s : { ...s, loading: true }));
    run();
    // Deliberately bumps the counter on cleanup so any in-flight response is discarded as stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => { seq.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  useEffect(() => {
    const wanted = entities ? new Set<SyncEntityType>(entities) : null;
    const unsub = store.subscribe((e) => {
      if (wanted && e.entityTypes.length > 0 && !e.entityTypes.some((t) => wanted.has(t))) return;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(run, 25); // coalesce bursts of writes
    });
    return () => { unsub(); if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, run, entityKey]);

  return useMemo(() => ({ ...state, reload: run }), [state, run]);
}

/** Current settings (with defaults), kept in sync with the store. */
export function useSettings(): UkwSettings {
  const q = useStoreQuery((s) => s.settings.getAll(), [], ['settings']);
  return q.data ?? DEFAULT_SETTINGS;
}
