import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { CircleStopIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { IconButton } from '@/components/clio/primitives/icon-button';
import type { SessionEvidenceActions } from './session-evidence-types';
import { RunListRow } from './run-list-row';
import { railRuns, type RailRun } from './rail-run-rows';
import { mergeSessionSubagents } from '@/lib/session-agent-tasks';
import { t, ph } from '@lingui/core/macro';

/** Running lists what is running now; every run, finished ones too, is in Runs in the left bar. */
const RAIL_RUN_LIMIT = 8;

export type RailRunsProps = Pick<
  SessionEvidenceActions,
  'onOpenSubagent' | 'onOpenFlow' | 'onOpenRun' | 'onCancelTask'
> & {
  processes: readonly AsyncProcess[];
  subagents: readonly SubagentRun[];
};

/**
 * What this conversation is running, in the Runs page row. Enter opens the run's
 * record as a tab (Shift opens a delegated run's conversation) and Delete stops it
 * after asking. A failed run leaves Running; its record in Runs offers Retry.
 */
export function RailRuns({
  processes,
  subagents,
  onOpenSubagent,
  onOpenFlow,
  onOpenRun,
  onCancelTask,
}: RailRunsProps) {
  const shown = railRuns(processes, subagents)
    .filter((run) => run.active)
    .slice(0, RAIL_RUN_LIMIT);
  const [stopping, setStopping] = useState<RailRun>();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const submitting = useRef(new Set<string>());
  const [error, setError] = useState('');

  const stop = async (run: RailRun) => {
    const task = run.entry.process;
    if (!task || submitting.current.has(run.row.taskId)) return;
    submitting.current.add(run.row.taskId);
    setPending((previous) => new Set(previous).add(run.row.taskId));
    setError('');
    try {
      await onCancelTask?.(task);
    } catch (reason) {
      const label = run.row.label;
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(t`Could not stop ${label}: ${message}`);
    } finally {
      submitting.current.delete(run.row.taskId);
      setPending((previous) => {
        const next = new Set(previous);
        next.delete(run.row.taskId);
        return next;
      });
    }
  };
  const canStop = (run: RailRun) =>
    run.row.cancellable && !run.row.cancelRequested && Boolean(run.entry.process && onCancelTask);
  const open = (run: RailRun, target: 'canvas' | 'conversation' = 'canvas') => {
    const { process, subagent } = run.entry;
    if (run.row.flowHandle && onOpenFlow) return onOpenFlow(run.row.flowHandle, run.row.label);
    const conversation =
      subagent ?? (process ? mergeSessionSubagents([], [process])[0] : undefined);
    const opensConversation = target === 'conversation' || !process || !onOpenRun;
    if (conversation?.child_session_id && opensConversation)
      return onOpenSubagent?.(conversation, target);
    if (process && onOpenRun) onOpenRun(
        run.entry.key,
        run.row.label,
        process.owner?.session_id ?? process.owner_session_id,
      );
  };
  const keys = (run: RailRun) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' && canStop(run)) {
      event.preventDefault();
      setStopping(run);
    }
  };

  return (
    <div
      className="@container/runs min-w-0"
      aria-label={t`Running in this conversation`}
      data-run-list=""
    >
      {shown.map((run) => (
        <RunListRow
          key={run.row.taskId}
          row={run.row}
          cancelRequested={run.row.cancelRequested ?? false}
          showWorkspace={false}
          density="rail"
          onOpen={(event) => open(run, event.shiftKey ? 'conversation' : 'canvas')}
          onTitleKeyDown={keys(run)}
          actions={
            canStop(run) ? (
              <IconButton
                size="sm"
                label={t`Stop ${ph({ label: run.row.label })}`}
                icon={<CircleStopIcon aria-hidden="true" />}
                className="hover:text-destructive"
                disabled={pending.has(run.row.taskId)}
                onClick={() => setStopping(run)}
              />
            ) : undefined
          }
        />
      ))}
      {shown.length ? null : (
        <p className="flex h-7 items-center px-2 text-ui text-muted-foreground">{t`Nothing is running`}</p>
      )}
      {error ? (
        <p role="alert" className="px-2 py-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog
        open={Boolean(stopping)}
        onOpenChange={(next) => {
          if (!next) setStopping(undefined);
        }}
      >
        <AlertDialogContent layer="task-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle>{t`Stop this run?`}</AlertDialogTitle>
            <p className="text-sm font-medium [overflow-wrap:anywhere]">{stopping?.row.label}</p>
            <AlertDialogDescription>
              {stopping?.row.source === 'agent_task'
                ? t`This also stops its descendant agents, downloads and shell processes.`
                : t`Stopping is requested from its owner and may take time to finish.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t`Keep running`}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (stopping) void stop(stopping);
              }}
            >
              {t`Stop run`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
