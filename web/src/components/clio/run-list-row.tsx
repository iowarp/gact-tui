import { memo, type KeyboardEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { RunState } from '@clio/core/v3';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { KeyValueGrid } from '@/components/clio/primitives/key-value-grid';
import { ListRow } from '@/components/clio/primitives/list-row';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { MetaValue } from '@/components/clio/primitives/tag';
import { taskProgressLabel } from '@/components/clio/task-progress-label';
import {
  RUN_ACTIONS_WIDTH,
  compactWhen,
  runConversationHref,
  runStateLabel,
} from '@/components/clio/run-presentation';
import { sourceLabels, type RunRow } from '@/routes/runs-rows';

/**
 * Develop's states folded onto a status mark and one plain word in a fixed
 * column: a spinner while working, a ring when queued, a dot for an outcome.
 * Failed and needs-inspection words take the error and warning tone.
 */
const LOOK: Partial<Record<RunState, { tone: StatusTone; word: string }>> = {
  running: { tone: 'running', word: 'running' },
  recovering: { tone: 'running', word: 'recovering' },
  stopping: { tone: 'running', word: 'stopping' },
  cancellation_requested: { tone: 'running', word: 'stopping' },
  pause_requested: { tone: 'waiting', word: 'pausing' },
  paused: { tone: 'stopped', word: 'paused' },
  queued: { tone: 'idle', word: 'queued' },
  waiting_user: { tone: 'waiting', word: 'reply' },
  waiting_permission: { tone: 'waiting', word: 'approve' },
  task_state_uncertain: { tone: 'warning', word: 'inspect' },
  recovery_required: { tone: 'warning', word: 'inspect' },
  completed: { tone: 'success', word: 'done' },
  failed: { tone: 'error', word: 'failed' },
  cancelled: { tone: 'stopped', word: 'cancelled' },
  interrupted: { tone: 'stopped', word: 'halted' },
  stopped: { tone: 'stopped', word: 'stopped' },
  yielded: { tone: 'idle', word: 'idle' },
};

function fullWhen(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(at),
  );
}

function RunDetails({ row, stateLabel }: { row: RunRow; stateLabel: string }) {
  return (
    <Popover>
      <NamedTooltip label="Details">
        <PopoverTrigger asChild>
          <Button
            aria-label={`Details for ${row.label}`}
            className="text-muted-foreground hover:bg-hover hover:text-foreground"
            size="icon-xs"
            variant="ghost"
          >
            <InfoIcon aria-hidden="true" />
          </Button>
        </PopoverTrigger>
      </NamedTooltip>
      <PopoverContent align="end" className="w-80 space-y-2 p-3 text-[12px]">
        <p className="truncate text-[13px] font-medium" title={row.label}>
          {row.label}
        </p>
        <KeyValueGrid
          items={[
            { label: 'State', value: stateLabel },
            { label: 'Backend status', value: row.reportedStatus, mono: true },
            ...(row.taskKind ? [{ label: 'Kind', value: row.taskKind }] : []),
            { label: 'Execution', value: sourceLabels[row.source] },
            {
              label: row.source === 'flow' ? 'Placement' : 'Host',
              value: (row.source === 'flow' ? row.placement : row.host) || 'Host unavailable',
            },
            { label: 'Workspace', value: row.workspaceLabel },
            { label: 'Updated', value: fullWhen(row.updatedAt) },
            { label: 'Task', value: row.taskId, mono: true },
          ]}
        />
        {row.assignment ? (
          <p className="clio-scrollbar max-h-40 overflow-y-auto whitespace-pre-wrap break-words border-t pt-2">
            {row.assignment}
          </p>
        ) : null}
        {row.statusDetail ? (
          <p className="clio-scrollbar max-h-32 overflow-y-auto whitespace-pre-wrap border-t pt-2 text-muted-foreground [overflow-wrap:anywhere]">
            Reported issue: {row.statusDetail}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export interface RunListRowProps {
  row: RunRow;
  cancelRequested: boolean;
  /** The Stop and More actions shown on hover (RunActions). */
  actions?: ReactNode;
  /** Hide the workspace column (a conversation's own rail). */
  showWorkspace?: boolean;
  /** Open the run in place (a workbench tab) instead of following its conversation link. */
  onOpen?: () => void;
  /** Keys on the run's name while it has focus (the rail's Delete and Shift+Enter). */
  onTitleKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /**
   * `rail` sizes for a narrow conversation rail: progress and the state word
   * appear from 380px instead of the Runs page's breakpoints.
   */
  density?: 'page' | 'rail';
}

/**
 * One run on one line: status mark, name, progress or a failed run's reason,
 * state word, execution, workspace, time, hover actions and details. Every
 * column has one width; source and workspace drop first as the list narrows.
 */
export const RunListRow = memo(function RunListRow({
  row,
  cancelRequested,
  actions,
  showWorkspace = true,
  onOpen,
  onTitleKeyDown,
  density = 'page',
}: RunListRowProps) {
  const rail = density === 'rail';
  const look = LOOK[row.state] ?? {
    tone: 'info' as const,
    word: row.state,
  };
  const stateLabel = runStateLabel(row, cancelRequested);
  const word = stateLabel === 'Cancellation requested' ? 'stopping' : look.word;
  const progress = taskProgressLabel(row.progress, row.taskKind, row.statusDetail);
  const reason =
    row.statusReason && row.state !== 'task_state_uncertain' ? row.statusReason : undefined;
  const href = runConversationHref(row);
  const where = row.source === 'flow' ? row.placement : row.host || 'Host unavailable';
  return (
    <ListRow
      data-run-state={row.state}
      status={<StatusIndicator display="column" label={stateLabel} tone={look.tone} />}
      title={
        onOpen ? (
          <button
            type="button"
            data-rail-row=""
            className="max-w-full truncate rounded-sm text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title={row.label}
            onClick={onOpen}
            onKeyDown={onTitleKeyDown}
          >
            {row.label}
          </button>
        ) : href ? (
          <Link
            className="font-medium hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            title={row.label}
            to={href}
          >
            {row.label}
          </Link>
        ) : (
          <span className="font-medium" title={row.label}>
            {row.label}
          </span>
        )
      }
      description={
        reason ? (
          <span className="text-destructive" title={reason}>
            {reason}
          </span>
        ) : progress ? (
          <span
            className={rail ? 'hidden @[380px]/runs:inline' : 'hidden @[520px]/runs:inline'}
            title={progress}
          >
            {progress}
          </span>
        ) : undefined
      }
      columns={
        <>
          <span
            className={cn(
              'w-[64px] shrink-0 truncate text-[12px] text-muted-foreground',
              rail && 'hidden @[380px]/runs:block',
              look.tone === 'error' && 'text-destructive',
              look.tone === 'warning' && 'text-warning',
            )}
            data-slot="run-state-word"
            title={stateLabel}
          >
            {word}
          </span>
          {rail ? null : (
            <span
              className="hidden w-[88px] shrink-0 truncate text-[12px] text-muted-foreground @[880px]/runs:block"
              title={`${sourceLabels[row.source]}, ${where}`}
            >
              {row.source === 'flow'
                ? sourceLabels.flow
                : `${sourceLabels[row.source]} on ${where}`}
            </span>
          )}
          {showWorkspace ? (
            <span
              className="hidden w-[132px] shrink-0 truncate text-[12px] text-muted-foreground @[680px]/runs:block"
              title={row.workspaceLabel}
            >
              {row.workspaceLabelFields.name}
            </span>
          ) : null}
        </>
      }
      meta={
        <MetaValue>
          <time dateTime={row.updatedAt} title={fullWhen(row.updatedAt)}>
            {compactWhen(row.updatedAt)}
          </time>
        </MetaValue>
      }
      actions={actions ?? null}
      actionsWidth={RUN_ACTIONS_WIDTH}
      info={<RunDetails row={row} stateLabel={stateLabel} />}
    />
  );
});
