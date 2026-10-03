import {
  A2uiCatalogRegistry,
  buildA2uiClientCapabilities,
  orderSupportedCatalogIds,
  type ClioRepository,
} from '@clio/core/v3';
import type { QueryClient } from '@tanstack/react-query';
import { KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from './kernel-catalog';
import { wrapKernelComponentWithPresets } from './kernel-presets';
import { shouldRetryA2uiRegistryFailure } from './registry-failure';

/** Negotiate a newly created session before its first send and warm the route's queries. */
export async function firstMessageMetadata(
  repository: Pick<ClioRepository, 'a2uiCatalogs' | 'a2uiCapabilities'>,
  queryClient: QueryClient,
  sessionId: string,
) {
  const [catalogs, capabilities] = await Promise.allSettled([
    queryClient.fetchQuery({
      queryKey: ['a2ui-catalogs', sessionId],
      queryFn: ({ signal }) => repository.a2uiCatalogs(sessionId, signal),
      staleTime: 60_000,
      retry: shouldRetryA2uiRegistryFailure,
    }),
    queryClient.fetchQuery({
      queryKey: ['a2ui-capabilities', sessionId],
      queryFn: ({ signal }) => repository.a2uiCapabilities(sessionId, signal),
      staleTime: 60_000,
      retry: shouldRetryA2uiRegistryFailure,
    }),
  ]);
  // Match the session registry's failure behavior: never advertise a catalog
  // without having resolved its real components and the agent's capabilities.
  if (catalogs.status === 'rejected' || capabilities.status === 'rejected') {
    return { a2uiClientCapabilities: buildA2uiClientCapabilities([]) };
  }
  const registry = new A2uiCatalogRegistry(
    { components: KERNEL_COMPONENTS, functions: KERNEL_FUNCTIONS },
    wrapKernelComponentWithPresets,
  );
  registry.load(catalogs.value.rows, catalogs.value.rejected);
  return {
    a2uiClientCapabilities: buildA2uiClientCapabilities(
      orderSupportedCatalogIds(
        registry.supportedCatalogIds(),
        capabilities.value.agent['v0.9'].supportedCatalogIds,
      ),
    ),
  };
}
