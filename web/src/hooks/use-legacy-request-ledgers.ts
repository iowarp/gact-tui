import type { Session } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { mergeKnownSessions } from './use-known-sessions';
import { useRepository } from './use-repository';

/**
 * The legacy approval and question ledgers, read across every conversation
 * (`/v1/permissions` and `/v1/questions` with no `session_id`), so the
 * attention feed is the same whether or not a conversation is open.
 *
 * A request names its conversation by id. One that neither the open family nor
 * the waiting list holds yet (its state lags the request) is read by id, so its
 * request is never dropped from the feed.
 */
export function useLegacyRequestLedgers({
  enabled,
  pollMs,
  family,
  waiting,
}: {
  enabled: boolean;
  pollMs: number;
  family: readonly Session[] | undefined;
  waiting: readonly Session[] | undefined;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const approvals = useQuery({
    queryKey: queryKeys.key('pending-approvals', settings.endpoint, 'all-active'),
    queryFn: ({ signal }) => repository.pendingApprovals(undefined, signal),
    enabled,
    refetchInterval: pollMs,
  });
  // Polled like approvals: the live stream only opens for the active session,
  // and a background session's question must reach this feed too.
  const questions = useQuery({
    queryKey: queryKeys.key('pending-questions', settings.endpoint, 'all-active'),
    queryFn: ({ signal }) => repository.pendingQuestions(undefined, signal),
    enabled,
    refetchInterval: pollMs,
  });
  const ownerIds = useMemo(() => {
    const known = new Set(mergeKnownSessions(family, waiting)?.map((item) => item.id));
    return [
      ...new Set(
        [...(approvals.data ?? []), ...(questions.data ?? [])]
          .map((request) => request.session_id)
          .filter((id) => id && !known.has(id)),
      ),
    ].toSorted();
  }, [approvals.data, family, questions.data, waiting]);
  const owners = useQuery({
    queryKey: queryKeys.key('session-directory', settings.endpoint, ...ownerIds),
    queryFn: ({ signal }) => repository.sessionsById(ownerIds, signal),
    enabled: ownerIds.length > 0,
    placeholderData: (previous) => previous,
  });
  const requestOwners = useMemo(
    () => owners.data?.filter((item) => ownerIds.includes(item.id)),
    [ownerIds, owners.data],
  );
  return { approvals, questions, requestOwners };
}
