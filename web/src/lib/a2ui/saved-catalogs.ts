import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { A2uiCatalogRegistry } from '@clio/core/v3';
import type { ReactComponentImplementation } from '@a2ui/react/v0_9';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';
import { wrapKernelComponentWithPresets } from './kernel-presets';
import { classifyA2uiRegistryFailure, shouldRetryA2uiRegistryFailure } from './registry-failure';
import type { A2uiRegistrySnapshot } from './registry-store';

/** A saved artifact can belong to a session other than the open chat; its catalog stays local. */
export function useSavedA2uiCatalogs(sessionId: string): A2uiRegistrySnapshot {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const query = useQuery({
    queryKey: ['saved-dashboard-catalogs', connectionScope(settings), sessionId],
    queryFn: ({ signal }) => repository.a2uiCatalogs(sessionId, signal),
    retry: shouldRetryA2uiRegistryFailure,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const registry = new A2uiCatalogRegistry<ReactComponentImplementation>(
      {
        components: KERNEL_COMPONENTS,
        functions: KERNEL_FUNCTIONS,
      },
      wrapKernelComponentWithPresets,
    );
    if (query.error) {
      const failure = classifyA2uiRegistryFailure(query.error);
      registry.markRouteUnavailable(failure.code, failure.detail);
    } else {
      registry.load(query.data?.rows ?? [], query.data?.rejected ?? []);
    }
    return { registry, catalogs: registry.catalogs(), isLoading: query.isLoading };
  }, [query.data, query.error, query.isLoading]);
}
