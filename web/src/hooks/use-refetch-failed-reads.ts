import type { StreamState } from '@clio/core/v3';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

/**
 * When the connection comes back to live, reads on screen that failed meanwhile are
 * asked for again: the rail's conversation pages and counts, Runs, Infrastructure and
 * any other list showing an outage's error. An agent dropping is not a browser
 * "offline" event, so React Query's own reconnect refetch never fires for it.
 *
 * Only the return to live re-runs them, once: a refetch with no data resets the query
 * to pending, so retrying whenever one has failed would loop on a real failure.
 */
export function useRefetchFailedReadsOnReconnect(state: StreamState) {
  const queryClient = useQueryClient();
  const wasLive = useRef(state === 'live');
  useEffect(() => {
    const back = state === 'live' && !wasLive.current;
    wasLive.current = state === 'live';
    if (!back) return;
    void queryClient.refetchQueries(
      { type: 'active', predicate: (query) => query.state.status === 'error' },
      // A read already retrying on its own keeps its request instead of being aborted.
      { cancelRefetch: false },
    );
  }, [queryClient, state]);
}
