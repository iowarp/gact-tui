import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { PROVIDER_CATALOG_STALE_TIME_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

function useProviderCatalogQuery(enabled: boolean, notifyOnChangeProps?: []) {
  const repository = useRepository();
  const { credentialsReady = true, settings } = useConnectionSettings();
  const queryKey = queryKeys.providerCatalog(settings.endpoint);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => repository.providerCatalog(false, signal),
    enabled: enabled && credentialsReady,
    staleTime: PROVIDER_CATALOG_STALE_TIME_MS,
    notifyOnChangeProps,
  });
  return { query, queryKey };
}

/**
 * Keep the provider catalog fetched without reading it. The caller never
 * re-renders for it, as an unread observer would on every staleness flip.
 */
export function useProviderCatalogWarmup() {
  useProviderCatalogQuery(true, []);
}

/** Keep the provider catalog warm and expose one explicit, authoritative refresh. */
export function useProviderCatalog(enabled = true) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { query, queryKey } = useProviderCatalogQuery(enabled);
  const refresh = useMutation({
    mutationFn: async (providerId?: string) => {
      if (!providerId) return repository.providerCatalog(true);
      await repository.refreshProviderModels([providerId]);
      // Re-probe only this provider; the others keep their cached evidence.
      return repository.providerCatalog(true, undefined, providerId);
    },
    onSuccess: (catalog) => queryClient.setQueryData(queryKey, catalog),
  });

  // Spreading the query would read, and so track, every field and re-render each
  // caller on any staleness or fetch flip. Inherit from it instead so a caller
  // tracks only the fields it reads.
  return Object.create(query, {
    isRefreshing: { enumerable: true, get: () => query.isFetching || refresh.isPending },
    refreshCatalog: { enumerable: true, value: refresh.mutate },
  }) as typeof query & { isRefreshing: boolean; refreshCatalog: typeof refresh.mutate };
}
