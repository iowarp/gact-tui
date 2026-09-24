import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { PROVIDER_CATALOG_STALE_TIME_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/** Keep the provider catalog warm and expose one explicit, authoritative refresh. */
export function useProviderCatalog(enabled = true) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { credentialsReady = true, settings } = useConnectionSettings();
  const queryKey = queryKeys.providerCatalog(settings.endpoint);
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => repository.providerCatalog(false, signal),
    enabled: enabled && credentialsReady,
    staleTime: PROVIDER_CATALOG_STALE_TIME_MS,
  });
  const refresh = useMutation({
    mutationFn: async (providerId?: string) => {
      if (!providerId) return repository.providerCatalog(true);
      await repository.refreshProviderModels([providerId]);
      // Re-probe only this provider; the others keep their cached evidence.
      return repository.providerCatalog(true, undefined, providerId);
    },
    onSuccess: (catalog) => queryClient.setQueryData(queryKey, catalog),
  });

  return {
    ...query,
    isRefreshing: query.isFetching || refresh.isPending,
    refreshCatalog: refresh.mutate,
  };
}
