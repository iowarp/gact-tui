import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { ChevronRightIcon, PauseIcon, PlayIcon } from 'lucide-react';
import { CloseIcon, MoreIcon, RetryIcon } from '@/lib/icon-vocabulary';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
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
import { isSettledTaskActivity, taskActivity, type TaskActivity } from './task-activity';
import { TaskActivityRow } from './task-activity-row';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ClioEvidenceViewProps } from './observability-evidence';

const settled = new Set(['completed', 'failed', 'cancelled', 'interrupted']);

export interface TaskPageControls {
  hasMore: boolean;
  pending: boolean;
  loadMore: () => Promise<unknown>;
  history?: {
    visible: boolean;
    toggle: () => void;
    items: readonly AsyncProcess[];
    hasMore: boolean;
    pending: boolean;
    loadMore: () => Promise<unknown>;
    error: string;
  };
}

/** Continue the same read; a page failure leaves the already loaded work visible. */
export function TaskPageContinuation({
  pagination,
  label = 'Load more work',
}: {
  pagination?: TaskPageControls;
  label?: string;
}) {
  const [error, setError] = useState('');
  if (!pagination?.hasMore) return null;
  return (
    <div className="py-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pagination.pending}
        onClick={async () => {
          setError('');
          try {
            await pagination.loadMore();
          } catch (reason) {
            setError(reason instanceof Error ? reason.message : String(reason));
          }
        }}
      >
        {pagination.pending ? 'Loading work…' : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export interface AsyncTaskListProps {
  compact?: boolean;
  processes: readonly AsyncProcess[];
  subagents?: readonly SubagentRun[];
  onOpenSubagent?: ClioEvidenceViewProps['onOpenSubagent'];
  onOpenFlow?: ClioEvidenceViewProps['onOpenFlow'];
  onCancelTask?: (task: AsyncProcess) => Promise<void>;
  onControlTask?: (task: AsyncProcess, action: 'pause' | 'resume' | 'restart') => Promise<void>;
  pagination?: TaskPageControls;
}

export function AsyncTaskList({
  compact = false,
  processes,
  subagents,
  onOpenSubagent,
  onOpenFlow,
  onCancelTask,
  onControlTask,
  pagination,
}: AsyncTaskListProps) {
  const [selected, setSelected] = useState<AsyncProcess>();
  const [requested, setRequested] = useState<Set<string>>(new Set());
  const submitting = useRef(new Set<string>());
  const [error, setError] = useState('');
  const [restart, setRestart] = useState<AsyncProcess>();
  const [controlling, setControlling] = useState<Record<string, string>>({});
  const history = pagination?.history;
  const activeHandles = new Set(processes.map((task) => task.handle ?? task.handle_id ?? task.id));
  const visibleProcesses = history?.visible
    ? [
        ...processes,
        ...history.items.filter(
          (task) =>
            settled.has(task.effective_status ?? task.live_state) &&
            !activeHandles.has(task.handle ?? task.handle_id ?? task.id),
        ),
      ]
    : processes;
  const control = async (task: AsyncProcess, action: 'pause' | 'resume' | 'restart') => {
    if (!onControlTask) return;
    const handle = task.handle ?? task.handle_id ?? task.id;
    const key = `control:${handle}`;
    if (submitting.current.has(key)) return;
    submitting.current.add(key);
    setControlling((previous) => ({ ...previous, [handle]: action }));
    setRestart(undefined);
    setError('');
    try {
      await onControlTask(task, action);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      submitting.current.delete(key);
      setControlling((previous) => {
        const next = { ...previous };
        delete next[handle];
        return next;
      });
    }
  };
  const confirm = async () => {
    if (!selected || !onCancelTask) return;
    const handle = selected.handle ?? selected.handle_id ?? selected.id;
    if (submitting.current.has(handle)) return;
    submitting.current.add(handle);
    setRequested((previous) => new Set([...previous, handle]));
    setSelected(undefined);
    setError('');
    try {
      await onCancelTask(selected);
    } catch (reason) {
      setRequested((previous) => new Set([...previous].filter((value) => value !== handle)));
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      submitting.current.delete(handle);
    }
  };
  const entries = taskActivity(visibleProcesses, subagents);
  const currentRows = history ? entries.filter((entry) => !isSettledTaskActivity(entry)) : entries;
  const completedRows = history ? entries.filter(isSettledTaskActivity) : [];
  const renderEntry = (entry: TaskActivity) => {
    const task = entry.process;
    if (!task)
      return (
        <TaskActivityRow
          compact={compact}
          key={entry.key}
          entry={entry}
          status={entry.subagent!.state}
          onOpenSubagent={onOpenSubagent}
          onOpenFlow={onOpenFlow}
        />
      );
    const handle = entry.key;
    const status = task.effective_status ?? task.live_state;
    const active = !settled.has(status);
    const cancellable = task.supported_actions?.includes('cancel');
    const cancelling =
      status !== 'task_state_uncertain' &&
      (active || cancellable) &&
      (task.cancel_requested || requested.has(handle));
    const kind = task.task_kind ?? (task.kind === 'agent' ? 'Subagent' : 'MCP');
    const restartKind = task.flow ? 'flow' : kind === 'Session' ? 'assignment' : 'subagent';
    return (
      <TaskActivityRow
        compact={compact}
        key={handle}
        entry={entry}
        onOpenSubagent={onOpenSubagent}
        onOpenFlow={onOpenFlow}
        status={
          cancelling
            ? 'cancellation_requested'
            : controlling[handle]
              ? `${controlling[handle]}_requested`
              : status
        }
        actions={
          <>
            {onControlTask
              ? (['pause', 'resume'] as const)
                  .filter((action) => task.supported_actions?.includes(action))
                  .filter((action) =>
                    action === 'resume'
                      ? ![
                          'running',
                          'working',
                          'busy',
                          'executing',
                          'starting',
                          'recovering',
                          'stopping',
                          'cancelling',
                          'cancellation_requested',
                          'resume_requested',
                        ].includes(status)
                      : !settled.has(status) &&
                        !['paused', 'stopped', 'pause_requested'].includes(status),
                  )
                  .map((action) => {
                    const ActionIcon = action === 'pause' ? PauseIcon : PlayIcon;
                    return (
                      <Button
                        key={action}
                        variant="ghost"
                        size="icon"
                        aria-label={`${action} ${kind}: ${task.title}`}
                        title={`${action === 'pause' ? 'Pause' : 'Resume'} ${task.flow ? 'flow' : 'agent'}`}
                        disabled={Boolean(
                          controlling[handle] || cancelling || status === 'pause_requested',
                        )}
                        onClick={() => void control(task, action)}
                      >
                        <ActionIcon aria-hidden="true" className="size-4" />
                      </Button>
                    );
                  })
              : null}
            {onControlTask && task.supported_actions?.includes('restart') ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`More actions for ${task.title}`}
                    title="More actions"
                    disabled={Boolean(controlling[handle] || cancelling)}
                  >
                    <MoreIcon aria-hidden="true" className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setRestart(task)}>
                    <RetryIcon aria-hidden="true" />
                    Restart {restartKind}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {cancellable && onCancelTask ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Cancel ${kind}: ${task.title}`}
                title="Cancel task"
                disabled={Boolean(cancelling)}
                onClick={() => {
                  setError('');
                  setSelected(task);
                }}
              >
                <CloseIcon aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </>
        }
      />
    );
  };
  return (
    <div className="min-w-0 space-y-0.5" aria-label="Background work">
      {currentRows.map(renderEntry)}
      <TaskPageContinuation pagination={pagination} />
      {history ? (
        <Collapsible
          open={history.visible}
          onOpenChange={(open) => {
            if (open !== history.visible) history.toggle();
          }}
          className="group/completed min-w-0"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-h-8 w-full items-center gap-1.5 rounded-sm px-1 text-left text-sm hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRightIcon
                aria-hidden="true"
                className="size-3.5 shrink-0 transition-transform group-data-[state=open]/completed:rotate-90"
              />
              Completed work
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-0.5 pl-2">
            {history.pending && !history.items.length ? (
              <p role="status">Loading completed work…</p>
            ) : null}
            {history.error ? <p role="alert">{history.error}</p> : null}
            {completedRows.map(renderEntry)}
            {!history.pending && !history.error && !history.hasMore && !completedRows.length ? (
              <p className="px-1 py-1 text-sm text-muted-foreground">No completed work.</p>
            ) : null}
            <TaskPageContinuation pagination={history} label="Load more completed work" />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(undefined);
        }}
      >
        <AlertDialogContent layer="task-confirmation" className="flex flex-col overflow-hidden">
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle>Cancel this task?</AlertDialogTitle>
            <p className="text-sm font-medium [overflow-wrap:anywhere]">{selected?.title}</p>
            <AlertDialogDescription>
              {selected?.task_kind === 'Subagent' ||
              selected?.task_kind === 'Session' ||
              selected?.kind === 'agent'
                ? 'This also cancels all descendant agents, downloads and shell processes.'
                : 'Cancellation is requested from its owner and may take time to finish.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <TaskAssignmentDisclosure assignment={selected?.description || selected?.title} />
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirm()}>Cancel task</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(restart)}
        onOpenChange={(open) => {
          if (!open) setRestart(undefined);
        }}
      >
        <AlertDialogContent layer="task-confirmation" className="flex flex-col overflow-hidden">
          <AlertDialogHeader className="shrink-0">
            <AlertDialogTitle>
              Restart this{' '}
              {restart?.flow
                ? 'flow'
                : restart?.task_kind === 'Session'
                  ? 'assignment'
                  : 'subagent'}
              ?
            </AlertDialogTitle>
            <p className="text-sm font-medium [overflow-wrap:anywhere]">{restart?.title}</p>
            <AlertDialogDescription>
              An active assignment is cancelled and settled first. The linked assignment keeps its
              context. Check uncertain effects before retrying operations.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <TaskAssignmentDisclosure assignment={restart?.description || restart?.title} />
          <AlertDialogFooter className="shrink-0">
            <AlertDialogCancel>Keep this run</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (restart) void control(restart, 'restart');
              }}
            >
              Restart{' '}
              {restart?.flow
                ? 'flow'
                : restart?.task_kind === 'Session'
                  ? 'assignment'
                  : 'subagent'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Keep confirmation readable while retaining the complete original assignment. */
function TaskAssignmentDisclosure({ assignment }: { assignment?: string }) {
  return (
    <Collapsible className="min-h-0 overflow-y-auto">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group/assignment px-0 text-muted-foreground">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-3.5 transition-transform group-data-[state=open]/assignment:rotate-90"
          />
          View assignment
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div
          role="region"
          aria-label="Task assignment"
          tabIndex={0}
          className="mt-2 max-h-[35dvh] overflow-y-auto text-sm whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          {assignment}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
