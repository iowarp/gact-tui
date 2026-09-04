import type { PendingInteraction } from '@clio/core/v3';
import {
  ArrowUpToLineIcon,
  BotIcon,
  MessageCircleQuestionIcon,
  WorkflowIcon,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { humanizeProtocolValue } from './presentation-labels';

/** Quiet lifecycle attribution for a question routed to an agent. */
export function AgentAnswerActivity({
  interaction,
  compact = false,
}: {
  interaction: PendingInteraction;
  compact?: boolean;
}) {
  const answered = interaction.status === 'answered' && interaction.answered_by === 'agent';
  if (compact) {
    return (
      <span
        className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"
        data-agent-question-state={answered ? 'answered' : 'answering'}
      >
        <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
        <span>{answered ? 'Agent answered MCP request' : 'Agent is answering MCP request'}</span>
      </span>
    );
  }

  const answers = answerEntries(interaction.payload?.answer_metadata);
  const answerTask = interaction.payload?.agent_answer_task;
  return (
    <div
      className="my-3 space-y-3 border-l-2 border-border pl-3 text-xs"
      data-agent-question-state={answered ? 'answered' : 'answering'}
    >
      <ActivityStep icon={MessageCircleQuestionIcon} title="MCP requested information">
        {interaction.prompt}
      </ActivityStep>
      <ActivityStep
        icon={BotIcon}
        title={
          answered
            ? 'Agent answered from conversation context'
            : 'Agent is working from conversation context'
        }
      >
        {answers.length > 0 ? (
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
        <ActivityStep icon={ArrowUpToLineIcon} title="Answer returned to MCP">
          The paused tool resumed with the validated response.
        </ActivityStep>
      ) : null}
      {answerTask?.child_session_id ? (
        <ActivityStep icon={WorkflowIcon} title="Answer turn">
          <span className="font-mono">{answerTask.child_session_id}</span>
        </ActivityStep>
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
