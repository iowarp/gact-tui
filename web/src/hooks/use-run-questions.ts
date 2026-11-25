import type { PendingInteraction } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useRunChildSession } from '@/hooks/use-flow-run';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { RunRow } from '@/routes/runs-rows';

const RUN_POLL_MS = 3_000;

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
/**
 * The questions a run asked, oldest first: matched by its handle, its call, the
 * MCP task an elicitation names, or a delegated run's child session.
 */
export function useRunQuestions(row: RunRow, live: boolean): PendingInteraction[] {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const sessionId = row.ownerSessionId ?? row.targetSessionId ?? '';
  const delegated = row.taskKind === 'Subagent';
  const { child } = useRunChildSession(row.handleId, delegated, live);
  const questions = useQuery({
    queryKey: queryKeys.key('flow-questions', settings.endpoint, sessionId),
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => repository.flowQuestions(sessionId, signal),
    refetchInterval: live ? RUN_POLL_MS : false,
    retry: false,
  });
  const invocation = row.task?.invocation_id;
  const backendTask = row.task?.backend?.task_id;
  return (questions.data ?? [])
    .filter((question) => {
      const payload = record(question.payload);
      return (
        question.task_id === row.handleId ||
        (invocation && question.source.invocation_id === invocation) ||
        (invocation && payload?.invocation_id === invocation) ||
        (backendTask && payload?.task_id === backendTask) ||
        (child && (question.owner_session_id === child || question.attended_session_id === child))
      );
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
