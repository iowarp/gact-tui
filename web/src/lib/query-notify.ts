import { hashKey, QueryClientContext } from '@tanstack/react-query';
import type { QueryKey, QueryObserverResult } from '@tanstack/react-query';
import { useCallback, useContext, useMemo, useSyncExternalStore } from 'react';

/**
 * Re-render on these result fields only. React Query re-renders an observer whose
 * result nobody has read yet on every change, including the idle stale flip, so a
 * query read only conditionally (a hidden panel, an error fallback) needs its fields
 * declared up front.
 */
export const QUERY_RESULT_FIELDS: Array<keyof QueryObserverResult> = ['data', 'error', 'isPending'];

/**
 * Whether a cached query is fetching, read without an observer. A page that owns the
 * query declares its fields with `notifyOnChangeProps` and leaves the fetch flag to
 * the component that shows it, so a background refetch re-renders only that leaf.
 * Outside a query client (an exported archive) nothing is fetching.
 */
export function useQueryFetching(queryKey: QueryKey | undefined, enabled = true): boolean {
  const cache = useContext(QueryClientContext)?.getQueryCache();
  const hash = queryKey ? hashKey(queryKey) : '';
  const active = Boolean(cache && queryKey) && enabled;
  const subscribe = useCallback(
    (notify: () => void) =>
      active && cache
        ? cache.subscribe((event) => {
            if (event.query.queryHash === hash) notify();
          })
        : () => {},
    [active, cache, hash],
  );
  const read = useMemo(
    () => () => active && cache?.get(hash)?.state.fetchStatus === 'fetching',
    [active, cache, hash],
  );
  return useSyncExternalStore(subscribe, read, read);
}
