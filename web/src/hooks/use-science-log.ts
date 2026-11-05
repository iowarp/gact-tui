import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** The cache key of one session's science log read. */
export function scienceLogQueryKey(endpoint: string, sessionId: string) {
  return queryKeys.key('science-log', endpoint, sessionId);
}

/**
 * The study a session belongs to, or `in_study: false`. Live `science.entry`
 * events merge into this read, and a `science.view` event (a study session
 * published a dashboard) re-reads it (see `lib/streaming/science-log-updates.ts`).
 */
export function useScienceLog(sessionId: string, enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: scienceLogQueryKey(settings.endpoint, sessionId),
    enabled: Boolean(sessionId) && enabled,
    queryFn: ({ signal }) => repository.scienceLog(sessionId, signal),
    retry: false,
  });
}

/**
 * The record of one tool call a study cites: the script it ran, its input and
 * output files with their hashes, and its environment. Read when `enabled`;
 * a settled call's record does not change.
 */
export function useTransformRecord(callId: string, enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('transform-record', settings.endpoint, callId),
    enabled: Boolean(callId) && enabled,
    queryFn: ({ signal }) => repository.transformRecord(callId, signal),
    staleTime: Infinity,
    retry: false,
  });
}
