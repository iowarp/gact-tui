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
  // A conversation turn's ask_user runs as its own Question task, parented to the turn.
  const asksOwnQuestions = row.taskKind === 'Session' || delegated;
  const askedHere = useQuery({
    queryKey: queryKeys.key('run-question-tasks', settings.endpoint, sessionId),
    enabled: Boolean(sessionId) && asksOwnQuestions,
    queryFn: ({ signal }) =>
      repository.sessionTasks(sessionId, { kind: 'Question', limit: 100 }, signal),
    refetchInterval: live ? RUN_POLL_MS : false,
    retry: false,
  });
  const ownQuestionTasks = new Set(
    (askedHere.data?.tasks ?? [])
      .filter((task) => task.owner.parent_handle === row.handleId)
      .map((task) => task.handle),
  );
  const invocation = row.task?.invocation_id;
  const backendTask = row.task?.backend?.task_id;
  return (questions.data ?? [])
    .filter((question) => {
      // A permission the approval mode granted on its own asked no one; it is audit, not a question.
      if (String(question.status) === 'auto_approved') return false;
      const payload = record(question.payload);
      return (
        question.task_id === row.handleId ||
        (question.task_id && ownQuestionTasks.has(question.task_id)) ||
        (invocation && question.source.invocation_id === invocation) ||
        (invocation && payload?.invocation_id === invocation) ||
        (backendTask && payload?.task_id === backendTask) ||
        (child && (question.owner_session_id === child || question.attended_session_id === child))
      );
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
