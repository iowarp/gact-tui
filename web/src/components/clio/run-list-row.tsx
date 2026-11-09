import { BotIcon, WorkflowIcon, WrenchIcon } from 'lucide-react';
import { memo, type MouseEvent, type ReactNode } from 'react';
import { HelpIcon } from '@/lib/icon-vocabulary';
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
}

/**
 * One run on one 32px line: status mark, name, the state word (or "3 of 5"),
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
}: RunListRowProps) {
  const look = runLook(row);
  const stateLabel = runStateLabel(row, cancelRequested);
  const word = stateLabel === 'Cancellation requested' ? 'stopping' : look.word;
  const progress = taskProgressLabel(row.progress, row.taskKind, row.statusDetail);
  const counted = look.tone === 'running' ? countedProgress(row.progress) : undefined;
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
      className={reason ? 'min-h-[44px] cursor-default' : 'h-8 cursor-default text-[12.5px]'}
      data-run-state={row.state}
      layout={reason ? 'stacked' : 'inline'}
      onClick={select}
      selected={selected}
      status={<StatusIndicator display="column" label={stateLabel} tone={look.tone} />}
      title={
        <button
          aria-current={selected ? 'true' : undefined}
          className="max-w-full truncate rounded-sm text-left outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            className="w-[64px] shrink-0 truncate text-[11px] text-muted-foreground tabular-nums"
            data-slot="run-state-word"
            title={progress ?? stateLabel}
          >
            {counted ?? word}
          </span>
          <NamedTooltip label={source}>
            <span className="hidden w-3.5 shrink-0 text-muted-foreground @[560px]/runs:flex">
              <RunSourceIcon className="size-3.5" source={row.source} />
              <span className="sr-only">{source}</span>
            </span>
          </NamedTooltip>
          {showWorkspace ? (
            <span
              className="hidden w-[92px] shrink-0 truncate text-[11px] text-muted-foreground @[680px]/runs:block"
              title={row.workspaceLabel}
            >
              {row.workspaceLabelFields.name}
            </span>
          ) : null}
          <time
            className="w-[30px] shrink-0 text-right text-[11px] text-muted-foreground"
            dateTime={row.updatedAt}
            title={fullWhen(row.updatedAt)}
          >
            {compactWhen(row.updatedAt)}
          </time>
        </>
      }
      actions={actions ?? null}
      actionsWidth={RUN_ACTIONS_WIDTH}
    />
  );
});
