import type { PendingInteraction } from '@clio/core/v3';
import {
  ArrowUpToLineIcon,
  BotIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  MessageCircleQuestionIcon,
  RouteIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { ClioStatus, type ClioStatusValue } from './status';
import { humanizeProtocolValue } from './presentation-labels';
import { agentInteractionRequestLabel } from './agent-answer-domain';

/** Quiet lifecycle attribution for a question routed to an agent. */
export function AgentAnswerActivity({
  interaction,
  compact = false,
}: {
  interaction: PendingInteraction;
  compact?: boolean;
}) {
  const answered = interaction.status === 'answered' && interaction.answered_by === 'agent';
  const fallback = interaction.routing_state === 'agent_elicitation_fallback_to_human';
  const requestLabel = agentInteractionRequestLabel(interaction);
  if (compact) {
    return (
      <span
        className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
        data-agent-question-state={fallback ? 'fallback' : answered ? 'answered' : 'answering'}
      >
        <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>
          {requestLabel} ·{' '}
          {fallback ? 'Needs your response' : answered ? 'Agent answered' : 'Agent is answering'}
        </span>
      </span>
    );
  }

  const answers = answerEntries(interaction.payload?.answer_metadata);
  const answerTask = interaction.payload?.agent_answer_task;
  const taskStatus =
    fallback && !answerTask
      ? 'unavailable'
      : answerTaskStatus(answerTask?.live_state ?? answerTask?.status);
  const taskTiming = answerTaskTiming(answerTask?.created_at, answerTask?.updated_at);
  return (
    <div
      className="my-3 flex flex-col gap-3 border-l-2 border-border pl-3 text-xs"
      data-agent-question-state={fallback ? 'fallback' : answered ? 'answered' : 'answering'}
      data-mcp-interaction-id={interaction.id}
      data-mcp-invocation-id={interaction.source.invocation_id}
      data-mcp-task-id={interaction.task_id}
    >
      <ActivityStep icon={MessageCircleQuestionIcon} title={requestLabel}>
        {interaction.prompt}
      </ActivityStep>
      <ActivityStep icon={WorkflowIcon} title="Agent answer turn">
        <div className="flex flex-wrap items-center gap-2">
          <ClioStatus className="py-0.5" value={taskStatus} />
          {taskTiming ? <span>{taskTiming}</span> : null}
        </div>
        {answerTask?.child_session_id ? (
          <span className="mt-1 block font-mono text-[10px]">{answerTask.child_session_id}</span>
        ) : null}
      </ActivityStep>
      <ActivityStep
        icon={BotIcon}
        title={
          answered
            ? 'Agent prepared an answer'
            : fallback
              ? 'Agent answer attempt'
              : 'Agent is reading conversation context'
        }
      >
        {answered && answers.length > 0 ? (
          <dl className="mt-1 grid gap-x-2 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
            {answers.map(([label, value]) => (
              <div className="contents" key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="break-words text-foreground/85">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </ActivityStep>
      {answered ? (
        <>
          <ActivityStep icon={CircleCheckIcon} title="Validated by MCP schema" />
          <ActivityStep icon={ArrowUpToLineIcon} title="Answer returned to MCP">
            The waiting request resumed with the accepted response.
          </ActivityStep>
        </>
      ) : null}
      {fallback ? (
        <>
          <ActivityStep
            icon={CircleAlertIcon}
            title={
              interaction.fallback_detail === 'agent_answer_schema_invalid'
                ? 'Answer rejected by MCP schema'
                : 'Agent could not complete the answer'
            }
          >
            {fallbackDescription(interaction.fallback_detail)}
            {interaction.fallback_detail ? (
              <details className="mt-1">
                <summary className="cursor-pointer">Technical details</summary>
                <code>{interaction.fallback_detail}</code>
              </details>
            ) : null}
          </ActivityStep>
          <ActivityStep icon={RouteIcon} title="Routed to you">
            The request remains available in the response stack.
          </ActivityStep>
        </>
      ) : null}
    </div>
  );
}

function ActivityStep({
  children,
  icon: Icon,
  title,
}: {
  children?: ReactNode;
  icon: LucideIcon;
  title: string;
}) {
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2">
      <Icon aria-hidden="true" className="mt-0.5 size-3.5 text-muted-foreground" />
      <div className="min-w-0">
        <div className="font-medium text-foreground/90">{title}</div>
        {children ? (
          <div className="mt-0.5 break-words text-muted-foreground">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

function answerEntries(values: Record<string, unknown> | undefined): Array<[string, string]> {
  if (!values) return [];
  return Object.entries(values)
    .filter(([key]) => key !== 'elicitation_action')
    .map(([key, value]) => [humanizeProtocolValue(key), formatAnswerValue(value)]);
}

function formatAnswerValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatAnswerValue).join(', ');
  if (value === null || value === undefined) return 'Not provided';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function answerTaskStatus(value: string | undefined): ClioStatusValue {
  if (value === 'queued' || value === 'running' || value === 'completed') return value;
  if (value === 'failed' || value === 'cancelled') return value;
  return value ? 'unknown' : 'pending';
}

function answerTaskTiming(createdAt: string | undefined, updatedAt: string | undefined): string {
  if (!createdAt || !updatedAt) return '';
  const elapsed = new Date(updatedAt).getTime() - new Date(createdAt).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return '';
  return elapsed < 1_000 ? `${elapsed} ms` : `${(elapsed / 1_000).toFixed(1)} s`;
}

function fallbackDescription(detail: string | undefined): string {
  if (detail === 'agent_answer_schema_invalid') {
    return 'The proposed values did not satisfy the schema supplied by the MCP server.';
  }
  if (detail === 'agent_answer_timeout') return 'The answer turn did not finish in time.';
  if (detail === 'agent_declined') return 'The conversation did not establish a confident answer.';
  if (detail === 'agent_answer_unparseable')
    return 'The answer turn did not return structured values.';
  return 'The automatic answer path stopped before MCP accepted a response.';
}
