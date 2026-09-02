import type { QueryClient, QueryKey } from '@tanstack/react-query';

/**
 * Refresh cached server state without turning an already-accepted mutation
 * into a client-visible failure when one follow-up query is unavailable.
 */
export function invalidateQueriesInBackground(
  queryClient: QueryClient,
  queryKeys: readonly QueryKey[],
): void {
  void Promise.allSettled(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}
