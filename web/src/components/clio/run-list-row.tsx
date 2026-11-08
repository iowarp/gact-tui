import { memo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { RunState } from '@clio/core/v3';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { KeyValueGrid } from '@/components/clio/primitives/key-value-grid';
import { ListRow } from '@/components/clio/primitives/list-row';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { MetaValue, Tag, type TagTone } from '@/components/clio/primitives/tag';
import { taskProgressLabel } from '@/components/clio/task-progress-label';
import {
  RUN_ACTIONS_WIDTH,
  compactWhen,
  runConversationHref,
  runStateLabel,
} from '@/components/clio/run-presentation';
import { sourceLabels, type RunRow } from '@/routes/runs-rows';

/**
 * Develop's states folded onto four looks: running, queued, failed and done.
 * Waiting is amber, cancelled and interrupted are grey, needs inspection is
 * amber with its reason.
 */
const LOOK: Partial<Record<RunState, { tone: StatusTone; tag: TagTone; word: string }>> = {
  running: { tone: 'running', tag: 'info', word: 'running' },
  recovering: { tone: 'running', tag: 'info', word: 'recovering' },
  stopping: { tone: 'running', tag: 'neutral', word: 'stopping' },
  cancellation_requested: { tone: 'running', tag: 'neutral', word: 'stopping' },
  pause_requested: { tone: 'waiting', tag: 'neutral', word: 'pausing' },
  paused: { tone: 'stopped', tag: 'neutral', word: 'paused' },
  queued: { tone: 'idle', tag: 'neutral', word: 'queued' },
  waiting_user: { tone: 'waiting', tag: 'warning', word: 'reply' },
  waiting_permission: { tone: 'waiting', tag: 'warning', word: 'approve' },
  task_state_uncertain: { tone: 'warning', tag: 'warning', word: 'inspect' },
  recovery_required: { tone: 'warning', tag: 'warning', word: 'inspect' },
  completed: { tone: 'success', tag: 'success', word: 'done' },
  failed: { tone: 'error', tag: 'danger', word: 'failed' },
  cancelled: { tone: 'stopped', tag: 'neutral', word: 'cancelled' },
  interrupted: { tone: 'stopped', tag: 'neutral', word: 'halted' },
  stopped: { tone: 'stopped', tag: 'neutral', word: 'stopped' },
  yielded: { tone: 'idle', tag: 'neutral', word: 'idle' },
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
}

/**
 * One run on one line: status, name, progress or a failed run's reason,
 * execution, workspace, state word, time, hover actions and details. Every
 * column has one width; source and workspace drop first as the list narrows.
 */
export const RunListRow = memo(function RunListRow({
  row,
  cancelRequested,
  actions,
  showWorkspace = true,
}: RunListRowProps) {
  const look = LOOK[row.state] ?? {
    tone: 'info' as const,
    tag: 'neutral' as const,
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
        href ? (
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
          <span className="hidden @[520px]/runs:inline" title={progress}>
            {progress}
          </span>
        ) : undefined
      }
      columns={
        <>
          <span
            className="hidden w-[88px] shrink-0 truncate text-[12px] text-muted-foreground @[880px]/runs:block"
            title={`${sourceLabels[row.source]}, ${where}`}
          >
            {row.source === 'flow' ? sourceLabels.flow : `${sourceLabels[row.source]} on ${where}`}
          </span>
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
      badge={
        <Tag title={stateLabel} tone={look.tag}>
          {word}
        </Tag>
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
