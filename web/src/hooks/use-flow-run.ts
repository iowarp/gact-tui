import { flowRunActive, type SubagentRun } from '@clio/core/v3';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { agentTaskToSubagent } from '@/lib/session-agent-tasks';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { SubagentOpenTarget } from '@/components/clio/subagent-card';

/** Cadence for re-reading a running flow. Unit: milliseconds. */
export const FLOW_RUN_POLL_MS = 2_000;

/**
 * The flow run checkpointed under one task, re-read while it runs so the plan,
 * its proposals and any stall appear as the task layer records them.
 */
export function useFlowRun(sessionId: string, handle: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('task-flow', settings.endpoint, sessionId, handle),
    enabled: Boolean(sessionId && handle),
    queryFn: ({ signal }) => repository.taskFlow(sessionId, handle, signal),
    refetchInterval: (query) =>
      query.state.data && flowRunActive(query.state.data) ? FLOW_RUN_POLL_MS : false,
  });
}

/** Open the conversation behind a task handle (a plan node, a council member, the flow). */
export function useOpenTaskHandle(
  onOpenSubagent: (subagent: SubagentRun, target: SubagentOpenTarget) => void,
) {
  const repository = useRepository();
  return useMutation({
    mutationFn: async ({ handle }: { handle: string; target: SubagentOpenTarget }) =>
      agentTaskToSubagent(await repository.agentTask(handle)),
    onSuccess: (subagent, { target }) => onOpenSubagent(subagent, target),
  });
}
