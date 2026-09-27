import type { SubagentRun } from '@clio/core/v3';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { liveSubagentSignature, mergeSessionSubagents } from '@/lib/session-agent-tasks';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/**
 * Every child agent of `sessionId`: the service's agent-task registry merged
 * with the live child records.
 *
 * The live records alone miss any child armed before this client connected or
 * never mentioned in a transcript message (a standing SPOTTER watcher is both),
 * so the registry read is the list; it is refetched whenever a live record
 * appears or changes state, so its states stay current without polling.
 */
export function useSessionAgentTasks(
  sessionId: string,
  live: readonly SubagentRun[],
): SubagentRun[] {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const signature = liveSubagentSignature(live);
  const tasks = useQuery({
    queryKey: [
      ...queryKeys.sessionObservabilityDetail(settings.endpoint, sessionId, 'agent-tasks'),
      signature,
    ],
    queryFn: ({ signal }) => repository.sessionAgentTasks(sessionId, signal),
    enabled: Boolean(sessionId),
    placeholderData: keepPreviousData,
  });
  return useMemo(() => mergeSessionSubagents(live, tasks.data), [live, tasks.data]);
}
