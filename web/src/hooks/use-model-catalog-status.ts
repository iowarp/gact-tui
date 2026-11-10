import type { QueryKey } from '@tanstack/react-query';
import { useQueryFetching } from '@/lib/query-notify';

/** The model catalog's settled state, plus the queries whose fetches show as loading. */
export interface ModelCatalogStatus {
  settled: 'error' | 'loading' | 'ready';
  queryKeys: [providers: QueryKey, models: QueryKey];
}

/**
 * The picker's catalog status. Background catalog fetches are read here, by the
 * composer that shows them, rather than by the page that owns the queries.
 */
export function useModelCatalogStatus(status: ModelCatalogStatus): 'error' | 'loading' | 'ready' {
  const providersFetching = useQueryFetching(status.queryKeys[0]);
  const modelsFetching = useQueryFetching(status.queryKeys[1]);
  return providersFetching || modelsFetching ? 'loading' : status.settled;
}
