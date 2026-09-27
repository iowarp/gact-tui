import type { UseQueryResult } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/**
 * Resolve a requested session that the cached session list does not contain.
 *
 * The workspace route keeps one session-list query per workspace. Moving to
 * another session in the same workspace reuses that cached list without a new
 * fetch, so a session created elsewhere (another tab, the CLI, an agent's
 * child session, a connect that landed on a freshly created conversation) was
 * missing from it, and the route showed "This agent service did not return the
 * requested session" until something else refetched the list. A cache miss is
 * not an answer: the list is refetched once for that session, and only a fresh
 * list that still lacks it means the service really does not have it.
 *
 * @returns `true` while the answer is not known yet (placeholder data, or the
 * confirming refetch has not settled), so the route shows loading instead of
 * the unavailable state. A failed fetch is not pending: the route shows the
 * query error.
 *
 * `isFetching` and `dataUpdatedAt` are read only once a confirmation is under
 * way. React Query re-renders a consumer for every result field it has read,
 * and this hook runs in the workspace route: reading them on every render made
 * each background poll of the session list (fetching, then settled with a new
 * `dataUpdatedAt`) re-render the whole route twice, even with identical data.
 */
export function useRequestedSessionLookup(
  sessionId: string,
  found: boolean,
  sessions: Pick<
    UseQueryResult<readonly { id: string }[]>,
    'isSuccess' | 'isError' | 'isPlaceholderData' | 'isFetching' | 'refetch' | 'dataUpdatedAt'
  >,
): boolean {
  const missing = Boolean(sessionId) && !found && sessions.isSuccess && !sessions.isPlaceholderData;
  const { refetch } = sessions;
  // Which session a confirming refetch was started for, and the list it
  // replaces. Adjusted during render (React's "state from props" pattern).
  const [confirmation, setConfirmation] = useState<{ sessionId: string; after: number }>();
  if (missing && confirmation?.sessionId !== sessionId) {
    setConfirmation({ sessionId, after: sessions.dataUpdatedAt });
  }

  useEffect(() => {
    if (confirmation?.sessionId === sessionId) void refetch();
  }, [confirmation, refetch, sessionId]);

  if (!sessionId || found || sessions.isError) return false;
  if (!sessions.isSuccess || sessions.isPlaceholderData) return true;
  if (confirmation?.sessionId !== sessionId) return true;
  return sessions.isFetching || sessions.dataUpdatedAt <= confirmation.after;
}
