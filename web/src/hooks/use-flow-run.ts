import { flowRunActive, type SubagentRun } from '@clio/core/v3';
import { useMutation, useQueries, useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { agentTaskToSubagent } from '@/lib/session-agent-tasks';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { SubagentOpenTarget } from '@/components/clio/subagent-card';

/** Cadence for re-reading a running flow. Unit: milliseconds. */
export const FLOW_RUN_POLL_MS = 2_000;

/**
 * The flow run checkpointed under one task, re-read while it runs so the workflow,
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

/** Open the conversation behind a task handle (a workflow step, a council member, the flow). */
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

/** When a flow's task started and, once it settled, when it last changed. Unit: epoch milliseconds. */
export interface FlowTaskTime {
  startedAt: number;
  settledAt?: number;
}

/**
 * Start and end times of the tasks a flow started, read from each task's
 * record. A task is read again when it settles, so a finished step shows how
 * long it took and a running one how long it has run.
 */
export function useFlowTaskTimes(
  tasks: readonly { handle?: string; settled: boolean }[],
): ReadonlyMap<string, FlowTaskTime> {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const rows = tasks.filter((task): task is { handle: string; settled: boolean } =>
    Boolean(task.handle),
  );
  const results = useQueries({
    queries: rows.map((task) => ({
      queryKey: queryKeys.key('flow-task-time', settings.endpoint, task.handle, task.settled),
      queryFn: ({ signal }: { signal: AbortSignal }) => repository.agentTask(task.handle, signal),
      staleTime: Infinity,
    })),
  });
  const times = new Map<string, FlowTaskTime>();
  rows.forEach((task, index) => {
    const record = results[index]?.data;
    const startedAt = Date.parse(record?.created_at ?? '');
    if (!record || Number.isNaN(startedAt)) return;
    const updatedAt = Date.parse(record.updated_at);
    times.set(task.handle, {
      startedAt,
      ...(task.settled && !Number.isNaN(updatedAt) ? { settledAt: updatedAt } : {}),
    });
  });
  return times;
}

/**
 * The final answer of the conversation behind a flow's task (a council
 * member's view, an arena entry): its last assistant message's last text.
 * Read only when `enabled`, since it loads that conversation.
 */
export function useFlowTaskAnswer(handle: string | undefined, enabled: boolean, settled: boolean) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('flow-task-answer', settings.endpoint, handle ?? '', settled),
    enabled: Boolean(handle) && enabled,
    staleTime: settled ? Infinity : 5_000,
    queryFn: async ({ signal }) => {
      const task = await repository.agentTask(handle!, signal);
      if (!task.child_session_id) return '';
      const transcript = await repository.transcript(task.child_session_id, signal);
      const last = transcript.messages.filter((message) => message.role === 'assistant').at(-1);
      const texts =
        last?.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])) ?? [];
      return (texts.at(-1) ?? '').trim();
    },
  });
}
