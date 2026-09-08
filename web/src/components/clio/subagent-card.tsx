import type { MessageBlock, SubagentRun } from '@clio/core/v3';
import { CornerDownLeftIcon, CornerDownRightIcon } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { SubAgentDispatch, type SubAgentState } from '@/components/theokit/sub-agent-dispatch';
import { formatDuration, truncate } from '@/lib/format';
import { SUBAGENT_RESULT_TRUNCATE_CHARS, SUBAGENT_TASK_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { getChildAgentAssignment } from './child-agent-presentation';
import { ActivityRow } from './activity-row';
import { BoundedResult } from './bounded-result';
import { useTranscriptPreviewLines } from '@/providers/appearance-provider';

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

/** One chronological child-agent ledger event: launch or return, never both. */
export function ClioSubagentLifecycleLine({
  stage,
  subagent,
  task,
  onOpen,
}: ClioSubagentLifecycleLineProps) {
  const lines = useTranscriptPreviewLines();
  const started = stage === 'delegate.started';
  const title = subagent?.title || 'Child agent';
  const detail = started
    ? task?.trim() ||
      (subagent ? getChildAgentAssignment(subagent).label : 'Waiting for the child task record.')
    : subagent?.result || subagent?.summary || 'No return summary was reported.';
  const Icon = started ? CornerDownRightIcon : CornerDownLeftIcon;
  const interactive = Boolean(subagent?.child_session_id && onOpen);

  const open = (shiftKey: boolean) => {
    if (subagent && interactive) onOpen?.(subagent, shiftKey ? 'canvas' : 'conversation');
  };

  return (
    <div className="min-w-0">
      <button
        aria-label={interactive ? `Open child conversation ${title}` : undefined}
        className={cn(
          'group flex w-full min-w-0 items-start gap-2 rounded-md px-1.5 py-1 text-left text-sm',
          interactive
            ? 'cursor-pointer outline-none transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/50'
            : 'cursor-default',
        )}
        disabled={!interactive}
        onClick={(event) => open(event.shiftKey)}
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault();
        }}
        title={
          interactive ? 'Open child conversation. Shift-click to open it in the canvas.' : detail
        }
        type="button"
      >
        <ActivityRow
          icon={<Icon aria-hidden="true" className="size-4" />}
          title={
            <>
              {title}{' '}
              <span className="font-normal text-muted-foreground">
                {started ? 'started' : 'returned'}
              </span>
            </>
          }
          status={!started ? subagent?.state : undefined}
          duration={!started ? subagent?.duration_ms : undefined}
        />
      </button>
      <div className="ml-7 text-sm leading-6">
        <BoundedResult lines={lines}>
          <p className="whitespace-pre-wrap break-words">{detail}</p>
        </BoundedResult>
      </div>
    </div>
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

  const assignment = getChildAgentAssignment(subagent);

  const openFromPointer = (event: MouseEvent<HTMLElement>) => {
    onOpen?.(subagent, event.shiftKey ? 'canvas' : 'conversation');
  };
  const openFromKeyboard = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen?.(subagent, event.shiftKey ? 'canvas' : 'conversation');
  };

  return (
    <div title={assignment.detail}>
      <SubAgentDispatch
        aria-label={`Open child conversation ${subagent.title}`}
        className={
          subagent.child_session_id && onOpen
            ? 'cursor-pointer outline-none transition-colors hover:border-primary/60 hover:bg-primary/5 focus-visible:ring-2 focus-visible:ring-ring/50'
            : undefined
        }
        onClick={subagent.child_session_id && onOpen ? openFromPointer : undefined}
        onKeyDown={subagent.child_session_id && onOpen ? openFromKeyboard : undefined}
        onMouseDown={
          subagent.child_session_id && onOpen
            ? (event) => {
                if (event.shiftKey) event.preventDefault();
              }
            : undefined
        }
        role={subagent.child_session_id && onOpen ? 'button' : undefined}
        run={{
          id: subagent.id,
          agent: subagent.title,
          task: compactText(assignment.label, SUBAGENT_TASK_TRUNCATE_CHARS),
          state: toTheoState(subagent.state),
          duration:
            subagent.duration_ms === undefined ? undefined : formatDuration(subagent.duration_ms),
          result: subagent.result
            ? compactText(subagent.result, SUBAGENT_RESULT_TRUNCATE_CHARS)
            : undefined,
        }}
        tabIndex={subagent.child_session_id && onOpen ? 0 : undefined}
        title={
          subagent.child_session_id && onOpen
            ? 'Open child conversation. Shift-click to open it in the canvas.'
            : undefined
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
    case 'waiting_permission':
    case 'waiting_user':
      return 'running';
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
