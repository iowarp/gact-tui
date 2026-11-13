import type { SubagentRun } from '@clio/core/v3';
import { ArrowLeftIcon, CircleStopIcon, ClockIcon, ExternalLinkIcon } from 'lucide-react';
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
import { useCountedTaskProgress } from '@/hooks/use-count-up';
import { formatDuration } from '@/lib/format';
import { formatLocale } from '@/lib/locale-format';
import { sourceLabels, type RunRow } from '@/routes/runs-rows';
import { t, ph } from '@lingui/core/macro';

const FlowRunView = lazy(() =>
  import('@/components/clio/flow-run-view').then((module) => ({ default: module.FlowRunView })),
);

function fullWhen(iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return t`Time unavailable`;
  return new Intl.DateTimeFormat(formatLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(at));
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
    return <span>{host ? t`queued on ${host}` : t`queued`}</span>;
  }
  if (row.state === 'failed') return <span className="text-destructive-text">{t`failed`}</span>;
  if (row.state === 'completed') {
    const end = row.terminalAt ? Date.parse(row.terminalAt) : Number.NaN;
    const time = Number.isNaN(end) ? undefined : elapsed(row.createdAt, end);
    return <span>{time ? t`done in ${time}` : t`done`}</span>;
  }
  const tone = runLook(row).tone;
  return (
    <span className={tone === 'waiting' || tone === 'warning' ? 'text-warning' : undefined}>
      {/* A status label shown mid-line; case-folding is safe in every offered language. */}
      {stateLabel.toLocaleLowerCase(formatLocale())}
    </span>
  );
}

/** One `.tsk` line: the row's own status mark, the words and a faint fact. */
function RunLine({ row, text, meta }: { row: RunRow; text: string; meta?: string }) {
  return (
    <div className="flex h-[30px] min-w-0 items-center gap-2.5 text-menu text-foreground/90">
      <RunStatusMark cancelRequested={Boolean(row.cancelRequested)} row={row} />
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      {meta ? (
        <span className="shrink-0 text-caption whitespace-nowrap text-faint tabular-nums">
          {meta}
        </span>
      ) : null}
    </div>
  );
}

/** Where a run ran, its assignment and its backend ids: kept, behind Details. */
function RunFacts({ row }: { row: RunRow }) {
  return (
    <TechnicalDetails className="text-meta" title={t`Details`}>
      <div className="mt-1 grid gap-3">
        {row.assignment ? (
          <section className="grid gap-1">
            <h3 className="text-caption font-semibold text-muted-foreground">{t`Assignment`}</h3>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.assignment}</p>
          </section>
        ) : null}
        {row.statusDetail ? (
          <p className="whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
            {t`Reported issue: ${ph({ issue: row.statusDetail })}`}
          </p>
        ) : null}
        <KeyValueGrid
          items={[
            { label: t`Execution`, value: sourceLabels[row.source] },
            {
              label: row.source === 'flow' ? t`Placement` : t`Host`,
              value: (row.source === 'flow' ? row.placement : row.host) || t`Host unavailable`,
            },
            { label: t`Workspace`, value: row.workspaceLabel },
            { label: t`Updated`, value: fullWhen(row.updatedAt) },
            { label: t`Backend status`, value: row.reportedStatus, mono: true },
            ...(row.taskKind ? [{ label: t`Kind`, value: row.taskKind }] : []),
            { label: t`Task`, value: row.taskId, mono: true },
            ...(row.handleId !== row.taskId
              ? [{ label: t`Handle`, value: row.handleId, mono: true }]
              : []),
          ]}
        />
      </div>
    </TechnicalDetails>
  );
}

/**
 * An execution's body in the spec's four states: its current step while it
 * runs, what it waits on (with Stop) while queued, one red line when it failed,
 * and the Result when done. A run waiting on you links to where you answer.
 */
function RunSummary({
  row,
  stateLabel,
  stop,
}: {
  row: RunRow;
  stateLabel: string;
  stop?: { onStop: () => void; stopping: boolean };
}) {
  const shownProgress = useCountedTaskProgress(row.progress, row.taskId);
  const progress = taskProgressLabel(shownProgress, row.taskKind, row.statusDetail);
  // A lost or failed run's last message is its reported issue, kept once under Details.
  const message =
    typeof row.progress?.message === 'string' &&
    row.progress.message.trim() &&
    row.progress.message.trim() !== row.statusDetail?.trim()
      ? row.progress.message.trim()
      : undefined;
  const reason =
    row.statusReason && row.state !== 'task_state_uncertain' ? row.statusReason : undefined;
  if (row.state === 'queued') {
    const host = row.source === 'flow' ? '' : row.host;
    return (
      <div className="grid gap-4 p-3.5">
        <StateView
          action={
            stop
              ? {
                  label: stop.stopping ? t`Stopping` : t`Stop`,
                  onClick: stop.onStop,
                  disabled: stop.stopping,
                }
              : undefined
          }
          detail={host ? t`Waiting on ${host}.` : t`Waiting for a free slot.`}
          icon={ClockIcon}
          kind="marker"
          title={t`Not started yet`}
        />
        <RunFacts row={row} />
      </div>
    );
  }
  if (row.state === 'completed') {
    const end = row.terminalAt ? Date.parse(row.terminalAt) : Number.NaN;
    const time = Number.isNaN(end) ? undefined : elapsed(row.createdAt, end);
    // The progress message is the last in-flight status ("Working"), not a result.
    return (
      <div className="grid gap-4 px-4 py-3.5">
        <section className="grid text-menu">
          <h3 className="mb-1.5 font-heading text-h3 font-semibold text-foreground">{t`Result`}</h3>
          <RunLine meta={progress} row={row} text={time ? t`Finished in ${time}.` : t`Finished.`} />
        </section>
        <RunFacts row={row} />
      </div>
    );
  }
  const settled = row.state === 'cancelled' || row.state === 'stopped' || row.state === 'paused';
  const headline =
    row.state === 'failed'
      ? (message ?? t`The run stopped with an error`)
      : settled
        ? stateLabel
        : (message ?? (RUNNING.includes(row.state) ? t`Working` : stateLabel));
  const meta = progress && progress !== headline ? progress : undefined;
  const answerHref =
    row.state === 'waiting_user' || row.state === 'waiting_permission'
      ? runConversationHref(row, false)
      : undefined;
  return (
    <div className="grid gap-4 px-3.5 py-2.5">
      <div className="grid">
        <RunLine meta={meta} row={row} text={headline} />
        {reason ? (
          <p className="-mt-1 mb-1 ml-6 truncate text-label text-destructive-text" title={reason}>
            {reason}
          </p>
        ) : null}
        {answerHref ? (
          <Button asChild className="mt-1 ml-6 justify-self-start" size="compact" variant="outline">
            <Link to={answerHref}>{row.state === 'waiting_user' ? t`Answer` : t`Review`}</Link>
          </Button>
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
  onStop,
  stopping = false,
  onClose,
}: {
  row: RunRow;
  stateLabel: string;
  /** The run's menu (RunActions with `part="menu"`). */
  actions?: ReactNode;
  /** Stop the run; absent when it can't be stopped. */
  onStop?: () => void;
  /** Cancellation is requested or on its way. */
  stopping?: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const sheet = useMediaQuery('(max-width: 899px)');
  const href = runConversationHref(row, false);
  const flow = row.flowHandle && row.targetSessionId ? row.flowHandle : undefined;
  const stop = onStop ? { onStop, stopping } : undefined;
  // The spec draws Stop first, before the rule; a queued run's Stop sits in its body.
  const stopButton =
    stop && row.state !== 'queued' ? (
      <IconButton
        disabled={stopping}
        icon={<CircleStopIcon aria-hidden="true" />}
        label={stopping ? t`Stopping` : t`Stop`}
        onClick={stop.onStop}
        size="sm"
        tooltipSide="bottom"
      />
    ) : undefined;
  const openSubagent = (subagent: SubagentRun) => {
    if (!row.workspaceId) return;
    const session = subagent.child_session_id ?? subagent.session_id;
    void navigate(
      `/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(session)}`,
    );
  };
  return (
    <aside
      aria-label={t`Run: ${ph({ label: row.label })}`}
      className="flex h-full min-h-0 flex-col bg-background"
      data-maximized={sheet || undefined}
    >
      <div
        aria-label={t`Open runs`}
        className="flex h-[38px] shrink-0 items-center gap-1 border-b border-border px-1.5"
        role="tablist"
      >
        {sheet ? (
          <IconButton
            icon={<ArrowLeftIcon aria-hidden="true" />}
            label={t`Back to runs`}
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
              <NamedTooltip label={t`Open conversation`}>
                <Button
                  asChild
                  className="text-muted-foreground hover:bg-hover hover:text-foreground"
                  size="icon-xs"
                  variant="ghost"
                >
                  <Link aria-label={t`Open conversation`} to={href}>
                    <ExternalLinkIcon aria-hidden="true" />
                  </Link>
                </Button>
              </NamedTooltip>
            ) : null}
            {actions}
          </>
        }
        label={t`Run actions`}
        format={stopButton}
        rule={Boolean(stopButton)}
        what={
          <>
            <span className="shrink-0" data-frame-position="">
              <RunStateWord row={row} stateLabel={stateLabel} />
            </span>
            <span>{row.taskKind ?? sourceLabels[row.source]}</span>
          </>
        }
        where={
          <FrameCrumbs parts={[{ label: t`Runs`, onSelect: onClose }, { label: row.label }]} />
        }
      />
      <div className="clio-scrollbar min-h-0 flex-1 overflow-y-auto" role="tabpanel">
        {flow && row.targetSessionId ? (
          <Suspense fallback={<StateView kind="loading" title={t`Loading the flow run`} />}>
            <FlowRunView
              handle={flow}
              label={row.label}
              onOpenSubagent={openSubagent}
              sessionId={row.targetSessionId}
            />
          </Suspense>
        ) : (
          <RunSummary row={row} stateLabel={stateLabel} stop={stop} />
        )}
      </div>
    </aside>
  );
}
