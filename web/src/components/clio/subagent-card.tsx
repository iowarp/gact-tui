import { subagentOpenTarget, SUBAGENT_OPEN_HINT } from './subagent-navigation';
import type { MessageBlock, SubagentRun } from '@clio/core/v3';
import { BotIcon, ChevronRightIcon, ShieldCheckIcon } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { SubAgentDispatch, type SubAgentState } from '@/components/theokit/sub-agent-dispatch';
import { formatDuration, truncate } from '@/lib/format';
import { SUBAGENT_RESULT_TRUNCATE_CHARS, SUBAGENT_TASK_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { getChildAgentAssignment } from './child-agent-presentation';
import { ActivityRow } from './activity-row';
import { ClioToolInvocation } from './tool-invocation';
import { ClioStatus } from './status';
import { SubagentModel } from './subagent-model';

export interface ClioSubagentCardProps {
  subagent?: SubagentRun;
  onOpen?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

export type SubagentOpenTarget = 'conversation' | 'canvas';

type SubagentBlock = Extract<MessageBlock, { type: 'subagent' }>;

export interface ClioSubagentLifecycleLineProps {
  stage: NonNullable<SubagentBlock['stage']>;
  subagent?: SubagentRun;
  task?: string;
  onOpen?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

export interface ClioAgentMessageLineProps {
  block: Extract<MessageBlock, { type: 'agent_message' }>;
  subagent?: SubagentRun;
  onOpen?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

/** A child launch or return uses the same collapsed result row as other tools. */
export function ClioSubagentLifecycleLine({
  stage,
  subagent,
  task,
}: ClioSubagentLifecycleLineProps) {
  const started = stage === 'delegate.started';
  const continued = stage === 'delegate.superseded';
  const terminal = !started && !continued;
  const failed = terminal && subagent?.state === 'failed';
  const cancelled = terminal && subagent?.state === 'cancelled';
  const assignment = task?.trim() || (subagent ? getChildAgentAssignment(subagent).label : '');
  const result = subagent?.result || subagent?.summary;
  const label =
    [subagent?.agent_id, subagent?.origin?.name].filter(Boolean).join(': ') || 'Child agent';
  return (
    <ClioToolInvocation
      compact
      tool={{
        id: `${subagent?.id ?? 'child'}:${stage}`,
        session_id: subagent?.session_id ?? '',
        name: 'subagent',
        state: failed ? 'failed' : cancelled ? 'cancelled' : 'succeeded',
        duration_ms: terminal ? subagent?.duration_ms : undefined,
        input: { assignment, child_session_id: subagent?.child_session_id },
        output: terminal ? result : undefined,
        presentation: {
          action: started ? 'Delegate' : continued ? 'Continue subagent' : 'Subagent result',
          subject: 'child',
          summary: started
            ? 'Accepted'
            : continued
              ? 'Accepted'
              : failed
                ? 'Failed'
                : cancelled
                  ? 'Cancelled'
                  : 'Turn ended',
          blocks: [
            { id: 'child', type: 'text', label, text: label },
            ...(assignment
              ? [{ id: 'assignment', type: 'text' as const, label: 'Assignment', text: assignment }]
              : []),
            ...(terminal && result
              ? [
                  {
                    id: 'result',
                    type: 'markdown' as const,
                    label: 'Returned result',
                    text: result,
                  },
                ]
              : []),
            ...(terminal && !result
              ? [{ id: 'missing-result', type: 'text' as const, text: 'No result was recorded.' }]
              : []),
            ...(subagent?.child_session_id
              ? [
                  {
                    id: 'conversation',
                    type: 'link' as const,
                    target: 'session' as const,
                    label: 'Open child conversation',
                    uri: subagent.child_session_id,
                  },
                ]
              : []),
          ],
        },
      }}
    />
  );
}

/** Keep pending delegated work visible after an interim answer, outside its tool disclosure. */
export function ClioSubagentProgressLine({ subagent, onOpen }: ClioSubagentCardProps) {
  if (!subagent) return null;
  const name = subagent.agent_id || 'Child agent';
  const interactive = Boolean(subagent.child_session_id && onOpen);
  return (
    <button
      type="button"
      data-slot="subagent-progress"
      className="mt-2 flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-xs transition-colors enabled:hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-ring"
      disabled={!interactive}
      aria-label={`Open subagent ${name}`}
      onClick={(event) => onOpen?.(subagent, subagentOpenTarget(event))}
    >
      <BotIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="shrink-0 text-muted-foreground">Subagent</span>
      <span className="min-w-0 flex-1 truncate" title={subagent.title}>
        <span className="font-medium">{name}</span>
        {subagent.title && subagent.title !== name ? (
          <span className="ml-2 text-muted-foreground">{subagent.title}</span>
        ) : null}
      </span>
      <ClioStatus value={subagent.state} />
      {interactive ? <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0" /> : null}
    </button>
  );
}

/** One message delivered to a child, kept at its recorded transcript position. */
export function ClioAgentMessageLine({ block, subagent, onOpen }: ClioAgentMessageLineProps) {
  const interactive = Boolean(subagent?.child_session_id && onOpen);
  const recipient = subagent?.title || block.label || 'Child agent';
  return (
    <button
      aria-label={interactive ? `Open child conversation ${recipient}` : undefined}
      className={cn(
        'group flex w-full min-w-0 items-start rounded-md px-1 py-0.5 text-left text-sm',
        interactive
          ? 'cursor-pointer outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50'
          : 'cursor-default',
      )}
      disabled={!interactive}
      onClick={(event) => {
        if (subagent && interactive) onOpen?.(subagent, subagentOpenTarget(event));
      }}
      type="button"
    >
      <ActivityRow
        icon={<BotIcon aria-hidden="true" className="size-4 text-primary" />}
        title={<>Message to {recipient}</>}
        detail={compactText(block.message, SUBAGENT_TASK_TRUNCATE_CHARS)}
        action={
          <span className="text-xs text-muted-foreground">
            {block.action === 'wake' ? 'Follow-up started' : 'Queued'}
          </span>
        }
      />
    </button>
  );
}

export function ClioSubagentCard({ subagent, onOpen }: ClioSubagentCardProps) {
  if (!subagent) {
    return (
      <SubAgentDispatch
        run={{
          id: 'connecting',
          agent: 'Connecting child agent',
          task: 'Waiting for the live child record.',
          state: 'spawning',
        }}
      />
    );
  }

  if (isSpotterWatcher(subagent)) return <SpotterWatcherLine subagent={subagent} onOpen={onOpen} />;

  const assignment = getChildAgentAssignment(subagent);
  const interactive = Boolean(subagent.child_session_id && onOpen);

  const openFromPointer = (event: MouseEvent<HTMLElement>) => {
    onOpen?.(subagent, subagentOpenTarget(event));
  };
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen?.(subagent, subagentOpenTarget(event));
  };

  return (
    <div title={assignment.detail}>
      <SubAgentDispatch
        aria-label={
          interactive
            ? `Open child conversation ${subagent.title}`
            : `Child conversation unavailable for ${subagent.title}`
        }
        className={
          interactive
            ? 'cursor-pointer outline-none transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50'
            : 'cursor-default'
        }
        onClick={interactive ? openFromPointer : undefined}
        onKeyDown={interactive ? openFromKeyboard : undefined}
        onMouseDown={
          interactive
            ? (event) => {
                if (event.shiftKey) event.preventDefault();
              }
            : undefined
        }
        role={interactive ? 'button' : undefined}
        run={{
          id: subagent.id,
          agent: subagent.title,
          task: compactText(assignment.label, SUBAGENT_TASK_TRUNCATE_CHARS),
          state: toTheoState(subagent.state),
          duration:
            subagent.duration_ms === undefined ? undefined : formatDuration(subagent.duration_ms),
          model: subagent.model_choice ? <SubagentModel choice={subagent.model_choice} /> : undefined,
          result: subagent.result
            ? compactText(subagent.result, SUBAGENT_RESULT_TRUNCATE_CHARS)
            : undefined,
        }}
        tabIndex={interactive ? 0 : undefined}
        title={
          interactive ? SUBAGENT_OPEN_HINT : 'This run has no linked child conversation to open.'
        }
      />
    </div>
  );
}

function toTheoState(state: SubagentRun['state']): SubAgentState {
  switch (state) {
    case 'queued':
      return 'spawning';
    case 'running':
    case 'stopping':
    case 'stopped':
    case 'cancellation_requested':
    case 'task_state_uncertain':
    case 'recovering':
    case 'waiting_permission':
    case 'waiting_user':
      return state;
    case 'paused':
      return 'paused';
    case 'yielded':
      return 'yielded';
    case 'recovery_required':
      return 'recovery_required';
    case 'pause_requested':
      return 'pause_requested';
    case 'completed':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    case 'interrupted':
      return 'interrupted';
    case 'unknown':
      return 'unknown';
    default: {
      const unhandled: never = state;
      void unhandled;
      return 'unknown';
    }
  }
}

/** Collapses wrapped prose to a single line, then cuts it to the card's budget. */
function compactText(value: string, limit: number): string {
  return truncate(value.replace(/\s+/gu, ' ').trim(), limit);
}

/** The standing SPOTTER watcher (run label "SPOTTER AI") armed by the SPOTTER review policy. */
function isSpotterWatcher(subagent: SubagentRun): boolean {
  return subagent.title.startsWith('SPOTTER AI') || subagent.agent_id === 'spotter_watcher';
}

/** One quiet line instead of a dispatch card: the watcher has no assignment of its own. */
function SpotterWatcherLine({
  subagent,
  onOpen,
}: {
  subagent: SubagentRun;
  onOpen?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}) {
  const interactive = Boolean(subagent.child_session_id && onOpen);
  const busy = subagent.state === 'running' || subagent.state === 'queued';
  return (
    <button
      aria-label={interactive ? 'Open the SPOTTER review conversation' : undefined}
      className={cn(
        'flex min-h-5 w-full min-w-0 items-center gap-1.5 px-1 text-left text-xs text-muted-foreground outline-none',
        interactive
          ? 'cursor-pointer hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring/50'
          : 'cursor-default',
      )}
      disabled={!interactive}
      onClick={(event) => onOpen?.(subagent, subagentOpenTarget(event))}
      title={interactive ? SUBAGENT_OPEN_HINT : undefined}
      type="button"
    >
      <ShieldCheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
      <span className="shrink-0 text-foreground">SPOTTER review started</span>
      <span className="truncate">{busy ? 'reviewing this session' : 'watching this session'}</span>
    </button>
  );
}
