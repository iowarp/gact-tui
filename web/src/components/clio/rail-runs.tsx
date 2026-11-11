import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { ActivityIcon, ChevronRightIcon, CircleStopIcon } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Link, useInRouterContext } from 'react-router-dom';
import { RetryIcon } from '@/lib/icon-vocabulary';
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

/** The rail lists a conversation's latest runs; All runs holds the rest. */
const RAIL_RUN_LIMIT = 8;

export type RailRunsProps = Pick<
  SessionEvidenceActions,
  'onOpenSubagent' | 'onOpenFlow' | 'onCancelTask' | 'onControlTask'
> & {
  processes: readonly AsyncProcess[];
  subagents: readonly SubagentRun[];
};

/**
 * The conversation's runs in the Runs page row. Enter opens a run as a tab,
 * Delete stops it after asking and Shift+Enter retries a failed one.
 */
export function RailRuns({
  processes,
  subagents,
  onOpenSubagent,
  onOpenFlow,
  onCancelTask,
  onControlTask,
}: RailRunsProps) {
  const runs = railRuns(processes, subagents);
  const shown = runs.slice(0, RAIL_RUN_LIMIT);
  const routed = useInRouterContext();
  const [stopping, setStopping] = useState<RailRun>();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const submitting = useRef(new Set<string>());
  const [error, setError] = useState('');

  const act = async (run: RailRun, action: 'cancel' | 'restart') => {
    const task = run.entry.process;
    if (!task || submitting.current.has(run.row.taskId)) return;
    submitting.current.add(run.row.taskId);
    setPending((previous) => new Set(previous).add(run.row.taskId));
    setError('');
    try {
      if (action === 'cancel') await onCancelTask?.(task);
      else await onControlTask?.(task, 'restart');
    } catch (reason) {
      setError(
        `${action === 'cancel' ? 'Could not stop' : 'Could not retry'} ${run.row.label}: ${
          reason instanceof Error ? reason.message : String(reason)
        }`,
      );
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
  const canRetry = (run: RailRun) => run.retryable && Boolean(run.entry.process && onControlTask);
  const open = (run: RailRun, target: 'canvas' | 'conversation' = 'canvas') => {
    const { process, subagent } = run.entry;
    if (run.row.flowHandle && onOpenFlow) return onOpenFlow(run.row.flowHandle, run.row.label);
    const conversation =
      subagent ?? (process ? mergeSessionSubagents([], [process])[0] : undefined);
    if (conversation?.child_session_id) onOpenSubagent?.(conversation, target);
  };
  const keys = (run: RailRun) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' && canStop(run)) {
      event.preventDefault();
      setStopping(run);
    } else if (event.key === 'Enter' && event.shiftKey && canRetry(run)) {
      event.preventDefault();
      void act(run, 'restart');
    }
  };

  return (
    <div
      className="@container/runs min-w-0"
      aria-label="Runs in this conversation"
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
                label={`Stop ${run.row.label}`}
                icon={<CircleStopIcon aria-hidden="true" />}
                className="hover:text-destructive"
                disabled={pending.has(run.row.taskId)}
                onClick={() => setStopping(run)}
              />
            ) : canRetry(run) ? (
              <IconButton
                size="sm"
                label={`Retry ${run.row.label}`}
                icon={<RetryIcon aria-hidden="true" />}
                disabled={pending.has(run.row.taskId)}
                onClick={() => void act(run, 'restart')}
              />
            ) : undefined
          }
        />
      ))}
      {routed ? (
        <Link
          to="/runs"
          data-rail-row=""
          className="flex h-7 items-center gap-2 rounded-[5px] px-2 text-[13px] hover:bg-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <ActivityIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          <span className="flex-1">
            {runs.length > shown.length ? `All runs (${runs.length})` : 'All runs'}
          </span>
          <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
        </Link>
      ) : null}
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
            <AlertDialogTitle>Stop this run?</AlertDialogTitle>
            <p className="text-sm font-medium [overflow-wrap:anywhere]">{stopping?.row.label}</p>
            <AlertDialogDescription>
              {stopping?.row.source === 'agent_task'
                ? 'This also stops its descendant agents, downloads and shell processes.'
                : 'Stopping is requested from its owner and may take time to finish.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (stopping) void act(stopping, 'cancel');
              }}
            >
              Stop run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
