import type { MessageBlock, SubagentRun } from '@clio/core/v3';
import { BotIcon, CornerDownRightIcon } from 'lucide-react';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { SubAgentDispatch, type SubAgentState } from '@/components/theokit/sub-agent-dispatch';
import { formatDuration, truncate } from '@/lib/format';
import { SUBAGENT_RESULT_TRUNCATE_CHARS, SUBAGENT_TASK_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { getChildAgentAssignment } from './child-agent-presentation';
import { ActivityRow } from './activity-row';
import { ClioStatus } from './status';

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

/** One chronological child-agent ledger event: launch or return, never both. */
export function ClioSubagentLifecycleLine({
  stage,
  subagent,
  task,
  onOpen,
}: ClioSubagentLifecycleLineProps) {
  const started = stage === 'delegate.started';
  const title = subagent?.title || 'Child agent';
  const detail = started
    ? task?.trim() ||
      (subagent ? getChildAgentAssignment(subagent).label : 'Waiting for the child task record.')
    : '';
  const interactive = Boolean(subagent?.child_session_id && onOpen);

  const open = (shiftKey: boolean) => {
    if (subagent && interactive) onOpen?.(subagent, shiftKey ? 'canvas' : 'conversation');
  };

  return (
    <div className="min-w-0 text-sm">
      <button
        aria-label={interactive ? `Open child conversation ${title}` : undefined}
        className={cn(
          'group flex min-h-5 w-full min-w-0 items-center gap-1.5 rounded-md px-1 text-left',
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
          interactive ? 'Open child conversation. Shift-click to open it in the canvas.' : undefined
        }
        type="button"
      >
        <span aria-hidden="true" className="relative size-5 shrink-0 text-primary">
          <BotIcon className="absolute left-0 top-0 size-4" />
          <CornerDownRightIcon className="absolute bottom-0 right-0 size-3 rounded-sm bg-background text-muted-foreground" />
        </span>
        <span className="min-w-0 truncate font-medium">{title}</span>
        <span className="shrink-0 text-muted-foreground">{started ? 'started' : 'returned'}</span>
        {!started && subagent?.duration_ms !== undefined ? (
          <span className="shrink-0 text-muted-foreground">
            {formatDuration(subagent.duration_ms)}
          </span>
        ) : null}
        {!started && subagent?.state ? (
          <ClioStatus compact className="shrink-0" value={subagent.state} />
        ) : null}
      </button>
      {started && detail ? <ExpandableChildPrompt text={detail} /> : null}
    </div>
  );
}

function ExpandableChildPrompt({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > SUBAGENT_TASK_TRUNCATE_CHARS;
  return (
    <div className="ml-7 min-w-0 pr-2 text-sm leading-5 text-foreground/90">
      <p
        className={cn(
          'whitespace-normal [overflow-wrap:anywhere]',
          long && !expanded && 'line-clamp-2',
        )}
      >
        {text}
      </p>
      {long ? (
        <button
          className="mt-0.5 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      ) : null}
    </div>
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
        if (subagent && interactive) onOpen?.(subagent, event.shiftKey ? 'canvas' : 'conversation');
      }}
      type="button"
    >
      <ActivityRow
        icon={<BotIcon aria-hidden="true" className="size-4 text-primary" />}
        title={<>Message to {recipient}</>}
        detail={compactText(block.message, SUBAGENT_TASK_TRUNCATE_CHARS)}
        inlineDetail
        action={
          <span className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground">
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
