import type { SubagentRun } from '@clio/core/v3';
import { ExternalLinkIcon } from 'lucide-react';
import { lazy, Suspense, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { FrameBar, FrameCrumbs, FrameTab } from '@/components/clio/primitives/frame-bar';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { KeyValueGrid } from '@/components/clio/primitives/key-value-grid';
import { StateView } from '@/components/clio/primitives/state-view';
import { StatusIndicator } from '@/components/clio/primitives/status-indicator';
import { RunSourceIcon } from '@/components/clio/run-list-row';
import { compactWhen, runConversationHref, runLook } from '@/components/clio/run-presentation';
import { taskProgressLabel } from '@/components/clio/task-progress-label';
import { TechnicalDetails } from '@/components/clio/technical-details';
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-1">
      <h3 className="text-[11px] font-semibold text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

/** What an execution reported: its state, why it stopped, the assignment and where it ran. */
function RunSummary({ row, stateLabel }: { row: RunRow; stateLabel: string }) {
  const look = runLook(row);
  const progress = taskProgressLabel(row.progress, row.taskKind, row.statusDetail);
  const reason =
    row.statusReason && row.state !== 'task_state_uncertain' ? row.statusReason : undefined;
  return (
    <div className="grid gap-4 p-3 text-[12.5px]">
      <div className="grid gap-1">
        <StatusIndicator label={stateLabel} tone={look.tone} />
        {reason ? (
          <p className="text-[12px] text-destructive [overflow-wrap:anywhere]">{reason}</p>
        ) : null}
        {progress ? <p className="text-[12px] text-muted-foreground">{progress}</p> : null}
      </div>
      {row.assignment ? (
        <Section title="Assignment">
          <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.assignment}</p>
        </Section>
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
        ]}
      />
      <TechnicalDetails className="text-[12px]" title="Technical details">
        <KeyValueGrid
          className="mt-1"
          items={[
            { label: 'Backend status', value: row.reportedStatus, mono: true },
            ...(row.taskKind ? [{ label: 'Kind', value: row.taskKind }] : []),
            { label: 'Task', value: row.taskId, mono: true },
            ...(row.handleId !== row.taskId
              ? [{ label: 'Handle', value: row.handleId, mono: true }]
              : []),
          ]}
        />
      </TechnicalDetails>
    </div>
  );
}

/**
 * The selected run as a tab beside the list: its name in the tab strip, Runs ›
 * name with what ran and when, then a flow's diagram and steps or an
 * execution's state, assignment and where it ran. Backend ids stay under
 * Technical details.
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
    <aside aria-label={`Run: ${row.label}`} className="flex h-full min-h-0 flex-col bg-background">
      <div
        aria-label="Open runs"
        className="flex h-[38px] shrink-0 items-center border-b border-border px-1.5"
        role="tablist"
      >
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
            <span>{row.taskKind ?? sourceLabels[row.source]}</span>
            <time dateTime={row.updatedAt} title={fullWhen(row.updatedAt)}>
              {compactWhen(row.updatedAt)}
            </time>
          </>
        }
        where={<FrameCrumbs parts={[{ label: 'Runs' }, { label: row.label }]} />}
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
