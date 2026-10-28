import type { ScienceLog } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { studyRunning } from '@/components/clio/science-log-model';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { STUDY_VIEW_POLL_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';

/** The cache key of one session's science log read. */
export function scienceLogQueryKey(endpoint: string, sessionId: string) {
  return queryKeys.key('science-log', endpoint, sessionId);
}

/** Whether a study's attached views may change without an entry: it has views and a branch runs. */
function viewsMayChange(log: ScienceLog | undefined): boolean {
  return Boolean(log?.in_study && log.views.length && studyRunning(log));
}

/**
 * The study a session belongs to, or `in_study: false`. Live `science.entry`
 * events merge into this read (see `lib/streaming/science-log-updates.ts`).
 * With `followViews`, the read also refreshes while the study's views may
 * change between entries (their owners revise them while a branch runs).
 */
export function useScienceLog(sessionId: string, enabled = true, followViews = false) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: scienceLogQueryKey(settings.endpoint, sessionId),
    enabled: Boolean(sessionId) && enabled,
    queryFn: ({ signal }) => repository.scienceLog(sessionId, signal),
    retry: false,
    refetchInterval: (query) =>
      followViews && viewsMayChange(query.state.data) ? STUDY_VIEW_POLL_MS : false,
    refetchIntervalInBackground: false,
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
