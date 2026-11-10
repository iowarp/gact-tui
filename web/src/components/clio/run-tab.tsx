import type { SubagentRun } from '@clio/core/v3';
import { ArrowLeftIcon, ClockIcon, ExternalLinkIcon } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FrameBar, FrameCrumbs, FrameTab } from '@/components/clio/primitives/frame-bar';
import { IconButton, NamedTooltip } from '@/components/clio/primitives/icon-button';
import { KeyValueGrid } from '@/components/clio/primitives/key-value-grid';
import { StateView } from '@/components/clio/primitives/state-view';
import { RunSourceIcon, RunStatusMark } from '@/components/clio/run-list-row';
import { runConversationHref, runLook } from '@/components/clio/run-presentation';
import { taskProgressLabel } from '@/components/clio/task-progress-label';
import { TechnicalDetails } from '@/components/clio/technical-details';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useNow } from '@/hooks/use-now';
import { formatDuration } from '@/lib/format';
import { sourceLabels, type RunRow } from '@/routes/runs-rows';

const FlowRunView = lazy(() =>
  import('@/components/clio/flow-run-view').then((module) => ({ default: module.FlowRunView })),
);

function fullWhen(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return 'Time unavailable';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(at),
  );
}

const RUNNING: readonly RunRow['state'][] = [
  'running',
  'recovering',
  'stopping',
  'cancellation_requested',
  'pause_requested',
];

function elapsed(from: string | undefined, to: number): string | undefined {
  const at = from ? Date.parse(from) : Number.NaN;
  if (Number.isNaN(at) || to < at) return undefined;
  return formatDuration(to - at, 'elapsed').replace(/ \d+s$/u, '');
}

/**
 * The spec's `.tl2` state word beside the run's name: "running 4m" in teal,
 * "queued on ares", a red "failed", "done in 6m". The row and the tab say the
 * same thing.
 */
function RunStateWord({ row, stateLabel }: { row: RunRow; stateLabel: string }) {
  const running = RUNNING.includes(row.state);
  const now = useNow(running);
  if (running) {
    const time = elapsed(row.createdAt, now);
    return (
      <span className="text-accent-foreground">
        {runLook(row).word}
        {time ? ` ${time}` : ''}
      </span>
    );
  }
  if (row.state === 'queued') {
    const host = row.source === 'flow' ? '' : row.host;
    return <span>{host ? `queued on ${host}` : 'queued'}</span>;
  }
  if (row.state === 'failed') return <span className="text-destructive-text">failed</span>;
  if (row.state === 'completed') {
    const end = row.terminalAt ? Date.parse(row.terminalAt) : Number.NaN;
    const time = Number.isNaN(end) ? undefined : elapsed(row.createdAt, end);
    return <span>{time ? `done in ${time}` : 'done'}</span>;
  }
  const tone = runLook(row).tone;
  return (
    <span className={tone === 'waiting' || tone === 'warning' ? 'text-warning' : undefined}>
      {stateLabel.toLowerCase()}
    </span>
  );
}

/** One `.tsk` line: the row's own status mark, the words and a faint fact. */
function RunLine({ row, text, meta }: { row: RunRow; text: string; meta?: string }) {
  return (
    <div className="flex h-[30px] min-w-0 items-center gap-2.5 text-[12.5px] text-foreground/90">
      <RunStatusMark cancelRequested={Boolean(row.cancelRequested)} row={row} />
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      {meta ? (
        <span className="shrink-0 text-[11px] whitespace-nowrap text-faint tabular-nums">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/** Where a run ran, its assignment and its backend ids: kept, behind Details. */
function RunFacts({ row }: { row: RunRow }) {
  return (
    <TechnicalDetails className="text-[12px]" title="Details">
      <div className="mt-1 grid gap-3">
        {row.assignment ? (
          <section className="grid gap-1">
            <h3 className="text-[11px] font-semibold text-muted-foreground">Assignment</h3>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.assignment}</p>
          </section>
        ) : null}
        {row.statusDetail ? (
          <p className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
            Reported issue: {row.statusDetail}
          </p>
        ) : null}
        <KeyValueGrid
          items={[
            { label: 'Execution', value: sourceLabels[row.source] },
            {
              label: row.source === 'flow' ? 'Placement' : 'Host',
              value: (row.source === 'flow' ? row.placement : row.host) || 'Host unavailable',
            },
            { label: 'Workspace', value: row.workspaceLabel },
            { label: 'Updated', value: fullWhen(row.updatedAt) },
            { label: 'Backend status', value: row.reportedStatus, mono: true },
            ...(row.taskKind ? [{ label: 'Kind', value: row.taskKind }] : []),
            { label: 'Task', value: row.taskId, mono: true },
            ...(row.handleId !== row.taskId
              ? [{ label: 'Handle', value: row.handleId, mono: true }]
              : []),
          ]}
        />
      </div>
    </TechnicalDetails>
  );
}

/**
 * An execution's body in the spec's four states: its current step while it
 * runs, what it waits on while queued, one red line when it failed, and the
 * Result when done. Stop sits in the frame bar.
 */
function RunSummary({ row, stateLabel }: { row: RunRow; stateLabel: string }) {
  const progress = taskProgressLabel(row.progress, row.taskKind, row.statusDetail);
  const message =
    typeof row.progress?.message === 'string' && row.progress.message.trim()
      ? row.progress.message.trim()
      : undefined;
  const reason =
    row.statusReason && row.state !== 'task_state_uncertain' ? row.statusReason : undefined;
  if (row.state === 'queued') {
    const host = row.source === 'flow' ? '' : row.host;
    return (
      <div className="grid gap-4 p-3.5">
        <StateView
          detail={host ? `Waiting on ${host}.` : 'Waiting for a free slot.'}
          icon={ClockIcon}
          kind="marker"
          title="Not started yet"
        />
        <RunFacts row={row} />
      </div>
    );
  }
  if (row.state === 'completed') {
    const end = row.terminalAt ? Date.parse(row.terminalAt) : Number.NaN;
    const time = Number.isNaN(end) ? undefined : elapsed(row.createdAt, end);
    const line = message ?? (time ? `Finished in ${time}.` : 'Finished.');
    return (
      <div className="grid gap-4 px-4 py-3.5">
        <section className="grid text-[12.5px]">
          <h3 className="mb-1.5 font-heading text-[15px] font-semibold text-foreground">Result</h3>
          <RunLine row={row} text={line} />
          {progress && progress !== message ? <RunLine row={row} text={progress} /> : null}
        </section>
        <RunFacts row={row} />
      </div>
    );
  }
  const settled = row.state === 'cancelled' || row.state === 'stopped' || row.state === 'paused';
  const headline =
    row.state === 'failed'
      ? (message && message !== row.statusDetail ? message : 'The run stopped with an error')
      : settled
        ? stateLabel
        : (message ?? (RUNNING.includes(row.state) ? 'Working' : stateLabel));
  const meta = progress && progress !== headline ? progress : undefined;
  return (
    <div className="grid gap-4 px-3.5 py-2.5">
      <div className="grid">
        <RunLine meta={meta} row={row} text={headline} />
        {reason ? (
          <p
            className="-mt-1 mb-1 ml-6 truncate text-[11.5px] text-destructive-text"
            title={reason}
          >
            {reason}
          </p>
        ) : null}
      </div>
      <RunFacts row={row} />
    </div>
  );
}

/**
 * The selected run as a tab beside the list: its name in the tab strip, Runs ›
 * name with what ran and when, then a flow's diagram and steps or an
 * execution's state, assignment and where it ran. Backend ids stay under
 * Technical details. Under 900px, where the workbench slides over the list,
 * the run takes the whole window with Back instead of leaving a strip of
 * clipped list rows beside it.
 */
export function RunTab({
  row,
  stateLabel,
  actions,
  onClose,
}: {
  row: RunRow;
  stateLabel: string;
  /** Stop and More for this run (RunActions). */
  actions?: ReactNode;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const sheet = useMediaQuery('(max-width: 899px)');
  const href = runConversationHref(row, false);
  const flow = row.flowHandle && row.targetSessionId ? row.flowHandle : undefined;
  const openSubagent = (subagent: SubagentRun) => {
    if (!row.workspaceId) return;
    const session = subagent.child_session_id ?? subagent.session_id;
    void navigate(
      `/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(session)}`,
    );
  };
  return (
    <aside
      aria-label={`Run: ${row.label}`}
      className="flex h-full min-h-0 flex-col bg-background"
      data-maximized={sheet || undefined}
    >
      <div
        aria-label="Open runs"
        className="flex h-[38px] shrink-0 items-center gap-1 border-b border-border px-1.5"
        role="tablist"
      >
        {sheet ? (
          <IconButton
            icon={<ArrowLeftIcon aria-hidden="true" />}
            label="Back to runs"
            onClick={onClose}
            size="sm"
          />
        ) : null}
        <FrameTab
          active
          icon={<RunSourceIcon source={row.source} />}
          label={row.label}
          onClose={onClose}
          onSelect={() => undefined}
        />
      </div>
      <FrameBar
        actions={
          <>
            {href ? (
              <NamedTooltip label="Open conversation">
                <Button
                  asChild
                  className="text-muted-foreground hover:bg-hover hover:text-foreground"
                  size="icon-xs"
                  variant="ghost"
                >
                  <Link aria-label="Open conversation" to={href}>
                    <ExternalLinkIcon aria-hidden="true" />
                  </Link>
                </Button>
              </NamedTooltip>
            ) : null}
            {actions}
          </>
        }
        label="Run actions"
        what={
          <>
            <span className="shrink-0" data-frame-position="">
              <RunStateWord row={row} stateLabel={stateLabel} />
            </span>
            <span>{row.taskKind ?? sourceLabels[row.source]}</span>
          </>
        }
        where={<FrameCrumbs parts={[{ label: 'Runs', onSelect: onClose }, { label: row.label }]} />}
      />
      <div className="clio-scrollbar min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {flow && row.targetSessionId ? (
          <Suspense fallback={<StateView kind="loading" title="Loading the flow run" />}>
            <FlowRunView
              handle={flow}
              label={row.label}
              onOpenSubagent={openSubagent}
              sessionId={row.targetSessionId}
            />
          </Suspense>
        ) : (
          <RunSummary row={row} stateLabel={stateLabel} />
        )}
      </div>
    </aside>
  );
}
