import {
  BotIcon,
  CheckIcon,
  MessageCircleQuestionIcon,
  TriangleAlertIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { memo, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatDuration } from '@/lib/format';
import { CloseIcon, HelpIcon } from '@/lib/icon-vocabulary';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { ListRow } from '@/components/clio/primitives/list-row';
import { StatusIndicator } from '@/components/clio/primitives/status-indicator';
import { taskProgressLabel } from '@/components/clio/task-progress-label';
import {
  RUN_ACTIONS_WIDTH,
  compactWhen,
  runLook,
  runStateLabel,
} from '@/components/clio/run-presentation';
import { sourceLabels, type RunRow, type RunSource } from '@/routes/runs-rows';

/*
 * Under 560px with a mouse, the hover actions take no column of their own: they
 * sit over the time, which hides while they show. Touch keeps them visible.
 */
const NARROW_ACTIONS_OVERLAY =
  'pointer-fine:@max-[559px]/runs:[&_[data-slot=list-row-actions]]:absolute pointer-fine:@max-[559px]/runs:[&_[data-slot=list-row-actions]]:inset-y-0 pointer-fine:@max-[559px]/runs:[&_[data-slot=list-row-actions]]:right-1.5 pointer-fine:@max-[559px]/runs:[&_[data-slot=list-row-actions]]:z-10';
const NARROW_TIME_UNDER_ACTIONS =
  'pointer-fine:@max-[559px]/runs:group-hover/list-row:invisible pointer-fine:@max-[559px]/runs:group-focus-within/list-row:invisible pointer-fine:@max-[559px]/runs:group-has-[[aria-haspopup][aria-expanded=true]]/list-row:invisible';

const SOURCE_ICONS: Record<RunSource, typeof BotIcon> = {
  agent_task: BotIcon,
  mcp_task: WrenchIcon,
  flow: WorkflowIcon,
  unknown: HelpIcon,
};

/** What ran: an agent, a tool, a flow. */
export function RunSourceIcon({ source, className }: { source: RunSource; className?: string }) {
  const Icon = SOURCE_ICONS[source];
  return <Icon aria-hidden="true" className={className} />;
}

/** The ring of a run that has not started (spec `.ring`). */
const QUEUED_RING = (
  <span aria-hidden="true" className="block size-3 rounded-full border-[1.5px] border-faint" />
);

/**
 * A run's own 14px glyph (spec `.d-st`): a question bubble while it waits on you,
 * ⚠ when it failed or needs inspecting, a ring when queued, ✓ when done, × when
 * stopped; work in progress keeps the shared spinner.
 */
function runStatusGlyph(state: RunRow['state']): ReactNode {
  switch (state) {
    case 'waiting_user':
    case 'waiting_permission':
      return <MessageCircleQuestionIcon className="size-3.5 text-warning" />;
    case 'failed':
      return <TriangleAlertIcon className="size-3.5 text-destructive-text" />;
    case 'interrupted':
    case 'task_state_uncertain':
    case 'recovery_required':
      return <TriangleAlertIcon className="size-3.5 text-warning" />;
    case 'queued':
    case 'yielded':
      return QUEUED_RING;
    case 'completed':
      return <CheckIcon className="size-3.5 text-accent-foreground" />;
    case 'cancelled':
    case 'stopped':
    case 'paused':
      return <CloseIcon className="size-3.5 text-muted-foreground" />;
    default:
      return undefined;
  }
}

/** The status column of a run: its glyph, named by the state in words on hover. */
export function RunStatusMark({
  row,
  cancelRequested,
  className,
}: {
  row: Pick<RunRow, 'state'>;
  cancelRequested: boolean;
  className?: string;
}) {
  const look = runLook(row);
  const label = runStateLabel(row, cancelRequested);
  return (
    <StatusIndicator
      className={cn('size-3.5', className)}
      display="column"
      icon={cancelRequested ? undefined : runStatusGlyph(row.state)}
      label={label}
      tone={cancelRequested ? 'running' : look.tone}
    />
  );
}

function fullWhen(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(at),
  );
}

/** "3 of 5" when a running task reports counted progress; it fits the state column. */
function countedProgress(progress: RunRow['progress']): string | undefined {
  const completed = progress?.completed;
  const total = progress?.total;
  return typeof completed === 'number' && typeof total === 'number' && total > 0
    ? `${completed} of ${total}`
    : undefined;
}

/** Whole percent done, for the inline bar; undefined without counted progress. */
function progressPercent(progress: RunRow['progress']): number | undefined {
  const completed = progress?.completed;
  const total = progress?.total;
  if (typeof completed !== 'number' || typeof total !== 'number' || total <= 0) return undefined;
  return Math.max(0, Math.min(100, Math.round((completed / total) * 100)));
}

export interface RunListRowProps {
  row: RunRow;
  cancelRequested: boolean;
  /** The Stop and More actions shown on hover (RunActions). */
  actions?: ReactNode;
  selected?: boolean;
  /** Open the run in the tab beside the list. */
  onSelect?: (row: RunRow) => void;
  /** Hide the workspace column (a conversation's own rail). */
  showWorkspace?: boolean;
  /** Open the run in place (a workbench tab) from its name. */
  onOpen?: (event: MouseEvent<HTMLButtonElement>) => void;
  /** Keys on the run's name while it has focus (the rail's Delete and Shift+Enter). */
  onTitleKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /**
   * `rail` sizes for a narrow conversation rail: the state word always shows, so the
   * status mark is never the only cue; outcomes draw as glyphs (✓, ⚠); the source
   * icon drops, and a child agent without a timestamp shows how long it ran.
   */
  density?: 'page' | 'rail';
}

/**
 * One run on one 32px line: status mark, name, a progress bar (narrow lists
 * only; wide lists show source and workspace instead), the state word (or "3 of 5"),
 * what ran, workspace, time and hover actions. A failed run's reason takes a
 * second line. Every column has one width; source and workspace drop first as
 * the list narrows. Choosing the row opens it beside the list.
 */
export const RunListRow = memo(function RunListRow({
  row,
  cancelRequested,
  actions,
  selected = false,
  onSelect,
  showWorkspace = true,
  onOpen,
  onTitleKeyDown,
  density = 'page',
}: RunListRowProps) {
  const rail = density === 'rail';
  const look = runLook(row);
  const stateLabel = runStateLabel(row, cancelRequested);
  const word = stateLabel === 'Cancellation requested' ? 'stopping' : look.word;
  const progress = taskProgressLabel(row.progress, row.taskKind, row.statusDetail);
  const counted = look.tone === 'running' ? countedProgress(row.progress) : undefined;
  const percent = look.tone === 'running' ? progressPercent(row.progress) : undefined;
  const elapsed =
    row.elapsedMs !== undefined && Number.isFinite(row.elapsedMs) && row.elapsedMs >= 0
      ? row.elapsedMs
      : undefined;
  const reason =
    row.statusReason && row.state !== 'task_state_uncertain' ? row.statusReason : undefined;
  const where = row.source === 'flow' ? row.placement : row.host || 'Host unavailable';
  const source =
    row.source === 'flow' ? sourceLabels.flow : `${sourceLabels[row.source]} on ${where}`;
  const select = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as Element;
    if (!event.currentTarget.contains(target)) return;
    if (target.closest('[data-slot=list-row-actions]')) return;
    onSelect?.(row);
  };
  return (
    <ListRow
      className={cn(
        reason ? 'min-h-[44px] cursor-default' : 'h-8 cursor-default text-[12.5px]',
        // The name's span truncates and would clip a ring drawn on the name itself.
        'has-[[data-run-title]:focus-visible]:ring-1 has-[[data-run-title]:focus-visible]:ring-ring has-[[data-run-title]:focus-visible]:ring-inset',
        // A narrow list doesn't reserve the hover actions' column: they cover the time instead.
        !rail && NARROW_ACTIONS_OVERLAY,
      )}
      data-run-state={row.state}
      layout={reason ? 'stacked' : 'inline'}
      onClick={select}
      selected={selected}
      status={<RunStatusMark cancelRequested={cancelRequested} row={row} />}
      title={
        <button
          aria-current={selected ? 'true' : undefined}
          className="max-w-full truncate text-left outline-none"
          data-rail-row={rail ? '' : undefined}
          data-run-title=""
          onClick={onOpen}
          onKeyDown={onTitleKeyDown}
          title={progress ? `${row.label}: ${progress}` : row.label}
          type="button"
        >
          {row.label}
        </button>
      }
      description={
        reason ? (
          <span className="text-[11.5px] text-destructive" title={reason}>
            {reason}
          </span>
        ) : undefined
      }
      columns={
        <>
          <span
            className="flex w-[34px] shrink-0 items-center @[560px]/runs:hidden"
            data-slot="run-progress"
          >
            {percent === undefined ? null : (
              <span
                aria-label={`${percent}% done`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={percent}
                className="h-[3px] w-full overflow-hidden rounded-full bg-muted"
                role="progressbar"
              >
                <span
                  className="block h-full rounded-full bg-primary"
                  style={{ width: `${percent}%` }}
                />
              </span>
            )}
          </span>
          <span
            className={cn(
              'w-[64px] shrink-0 truncate text-[11px] text-muted-foreground tabular-nums',
              rail && 'w-[56px]',
            )}
            data-slot="run-state-word"
            title={progress ?? stateLabel}
          >
            {counted ?? word}
          </span>
          {rail ? null : (
            <NamedTooltip label={source}>
              <span className="hidden w-3.5 shrink-0 text-muted-foreground @[560px]/runs:flex">
                <RunSourceIcon className="size-3.5" source={row.source} />
                <span className="sr-only">{source}</span>
              </span>
            </NamedTooltip>
          )}
          {showWorkspace ? (
            <span
              className="hidden w-[92px] shrink-0 truncate text-[11px] text-muted-foreground @[680px]/runs:block"
              title={row.workspaceLabel}
            >
              {row.workspaceLabelFields.name}
            </span>
          ) : null}
          {rail && !row.updatedAt ? (
            elapsed === undefined ? null : (
              <span
                className="w-[30px] shrink-0 text-right text-[11px] text-muted-foreground tabular-nums"
                title={`Ran for ${formatDuration(elapsed)}`}
              >
                {formatDuration(elapsed, 'compact')}
              </span>
            )
          ) : (
            <time
              className={cn(
                'w-[30px] shrink-0 text-right text-[11px] text-muted-foreground',
                !rail && NARROW_TIME_UNDER_ACTIONS,
              )}
              dateTime={row.updatedAt}
              title={fullWhen(row.updatedAt)}
            >
              {compactWhen(row.updatedAt)}
            </time>
          )}
        </>
      }
      actions={actions ?? null}
      actionsWidth={rail ? 28 : RUN_ACTIONS_WIDTH}
    />
  );
});
