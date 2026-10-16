import { RunActions } from '@/components/clio/run-actions';
import { queryKeys } from '@/lib/query-keys';
import { truncate } from '@/lib/format';
import {
  DATA_GRID_PAGE_SIZES,
  RUN_REASON_TRUNCATE_CHARS,
  RUNS_POLL_MS,
} from '@/lib/runtime-limits';
import type {
  TaskSnapshot,
  RunState,
  Session,
  ToolInvocation,
  TranscriptSnapshot,
  Workspace,
} from '@clio/core/v3';
import { operationalRunStateSchema } from '@clio/core/v3';
import {
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import {
  ActivityIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  SearchIcon,
  WorkflowIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { ClioDataGridTable } from '@/components/clio/data-grid-table';
import { ClioStatus } from '@/components/clio/status';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
  type DataGridFeatures,
} from '@/components/reui/data-grid/data-grid';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { capitalize, vocab } from '@/lib/brand-vocabulary';
import {
  workspaceLabels,
  workspaceLabelText,
  type WorkspaceDisplayLabel,
} from '@/lib/workspace-labels';
import { useConnectionSettings } from '@/providers/connection-provider';
import { returnRouteFromState, sessionIdFromRoute } from '@/lib/workspace-route-memory';
import { workflowDescriptor } from '@/components/clio/workflow-tool-presentation';
import { taskProgressLabel } from '@/components/clio/task-progress-label';

type RunSource = 'agent_task' | 'mcp_task' | 'unknown' | 'workflow';
const WORKFLOW_SCAN_BATCH = 4;

export interface RunRow {
  progress?: Record<string, unknown>;
  taskKind?: string;
  assignment?: string;
  ownerSessionId?: string;
  cancelRequested?: boolean;
  cancellable?: boolean;
  handleId: string;
  taskId: string;
  label: string;
  state: RunState;
  reportedStatus: string;
  statusReason?: string;
  source: RunSource;
  host: string;
  placement: string;
  workspaceLabel: string;
  workspaceLabelFields: WorkspaceDisplayLabel;
  workspaceId?: string;
  targetSessionId?: string;
  updatedAt: string;
  workflow?: ToolInvocation;
}

type ConfirmedRunAction = { kind: 'cancel'; row: RunRow };

const sourceLabels: Record<RunSource, string> = {
  agent_task: 'Agent',
  mcp_task: 'Tool',
  unknown: 'Unknown source',
  workflow: 'Workflow',
};

function conciseReason(reason: string | undefined): string | undefined {
  if (!reason) return undefined;
  try {
    const parsed = JSON.parse(reason) as Record<string, unknown>;
    const lastError = parsed.last_error;
    if (typeof lastError === 'string' && lastError.trim()) return lastError;
    const result = parsed.mcp_result;
    if (result && typeof result === 'object') {
      const protocolError = (result as Record<string, unknown>).protocol_error;
      if (typeof protocolError === 'string' && protocolError.trim()) return protocolError;
    }
  } catch {
    // Plain server-authored reasons are already suitable for display.
  }
  const embeddedReason = reason.match(
    /"(?:last_error|protocol_error|message)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/,
  );
  if (embeddedReason?.[1]) {
    try {
      return JSON.parse(`"${embeddedReason[1]}"`) as string;
    } catch {
      return embeddedReason[1];
    }
  }
  if (reason.trimStart().startsWith('{'))
    return 'The server reported structured failure details for this run.';
  return truncate(reason, RUN_REASON_TRUNCATE_CHARS);
}

function buildRows(
  runs: readonly TaskSnapshot[],
  sessions: readonly Session[],
  workspaces: readonly Workspace[],
): RunRow[] {
  const labels = workspaceLabels(workspaces);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return runs.map((run) => {
    const targetSessionId = run.owner.session_id;
    const targetSession = targetSessionId ? sessionsById.get(targetSessionId) : undefined;
    const workspaceId = targetSession?.workspace_id;
    const workspaceLabelFields = workspaceId
      ? (labels.get(workspaceId) ?? {
          name: `${capitalize(vocab.workspace)} unavailable`,
          qualifiers: [],
        })
      : { name: `${capitalize(vocab.workspace)} unavailable`, qualifiers: [] };
    return {
      handleId: run.handle,
      taskKind: run.kind,
      progress: run.progress,
      assignment: run.description_missing
        ? 'Assignment description unavailable'
        : (run.description ?? undefined),
      ownerSessionId: run.owner.session_id,
      cancelRequested: Boolean(run.cancellation_requested_at),
      cancellable: run.supported_actions.includes('cancel'),
      taskId: run.handle,
      label: run.label || 'Unnamed task',
      state: taskState(run),
      reportedStatus: run.raw_status || run.status,
      statusReason: ['failed', 'task_state_uncertain'].includes(run.status)
        ? conciseReason(run.progress.message)
        : undefined,
      source: ['Session', 'Subagent'].includes(run.kind) ? 'agent_task' : 'mcp_task',
      host: run.backend?.server || '',
      placement: run.backend?.placement || 'local',
      workspaceLabel: workspaceLabelText(workspaceLabelFields),
      workspaceLabelFields,
      workspaceId,
      targetSessionId,
      updatedAt: run.updated_at,
    };
  });
}

function taskState(task: TaskSnapshot): RunState {
  if (task.terminal_at || task.status === 'task_state_uncertain')
    return operationalRunStateSchema.parse(task.status);
  if (task.cancellation_requested_at) return 'cancellation_requested';
  const activity: Record<string, string> = {
    busy: 'running',
    executing: 'running',
    cancelling: 'cancellation_requested',
    waiting_for_input: 'waiting_user',
    idle: 'yielded',
  };
  return operationalRunStateSchema.parse(activity[task.activity] ?? (task.activity || task.status));
}

// Pure indexing keeps transcript-derived workflow identity deterministic and testable.
// oxlint-disable-next-line react/only-export-components
export function buildWorkflowRows(
  transcripts: readonly TranscriptSnapshot[],
  sessions: readonly Session[],
  workspaces: readonly Workspace[],
  tasks: readonly TaskSnapshot[] = [],
): RunRow[] {
  const labels = workspaceLabels(workspaces);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return transcripts.flatMap((transcript) =>
    Object.values(transcript.tools).flatMap((tool): RunRow[] => {
      const descriptor = workflowDescriptor(tool);
      if (!descriptor) return [];
      const session = sessionsById.get(tool.session_id);
      const workspaceId = session?.workspace_id;
      const launched = descriptor.steps.filter(
        (step) => step.launchState !== 'not_started' && step.launchState !== 'not_launched',
      );
      const steps = launched.map((step) => tasks.find((task) => task.handle === step.taskId));
      const recordedFailure = [
        'workflow_child_failed',
        'workflow_step_timeout',
        'workflow_spawn_refused',
      ].includes(descriptor.status ?? '');
      const recordedYield = ['workflow_predicate_unsatisfied', 'workflow_step_stalled'].includes(
        descriptor.status ?? '',
      );
      const allStepsLaunched = launched.length === descriptor.steps.length;
      const failedStep = descriptor.steps.find((step) => step.stepId === descriptor.failedStep);
      const unlaunched = descriptor.steps.filter((step) => step.launchState === 'not_launched');
      const completeVisibility = steps.every((task) => task !== undefined);
      const active = steps.some((task) => task && !task.terminal_at);
      const state: RunState =
        descriptor.status === 'task_state_uncertain' ||
        steps.some((task) => task?.status === 'task_state_uncertain')
          ? 'task_state_uncertain'
          : recordedFailure
            ? 'failed'
            : recordedYield
              ? 'yielded'
              : !steps.length || !completeVisibility
                ? 'unknown'
                : active
                  ? 'running'
                  : steps.some((task) => task?.status === 'failed')
                    ? 'failed'
                    : steps.some((task) => task?.status === 'cancelled')
                      ? 'cancelled'
                      : !allStepsLaunched
                        ? 'yielded'
                        : steps.every((task) => task?.status === 'completed')
                          ? 'completed'
                          : 'interrupted';
      const workspaceLabelFields = workspaceId
        ? (labels.get(workspaceId) ?? {
            name: `${capitalize(vocab.workspace)} unavailable`,
            qualifiers: [],
          })
        : { name: `${capitalize(vocab.workspace)} unavailable`, qualifiers: [] };
      return [
        {
          handleId: tool.id,
          taskId: tool.id,
          label: descriptor.label,
          state,
          reportedStatus: descriptor.status ?? state,
          statusReason: recordedFailure
            ? conciseReason(
                `Workflow failed${failedStep ? ` at ${failedStep.name}` : ''}.${unlaunched.length ? ` ${unlaunched.length} ${unlaunched.length === 1 ? 'step was' : 'steps were'} not launched.` : ''}`,
              )
            : recordedYield || !allStepsLaunched
              ? 'The declared workflow has an uncompleted step.'
              : completeVisibility && steps.length
                ? undefined
                : !launched.length && descriptor.steps.length
                  ? 'Steps have not launched.'
                  : 'Accepted step statuses are not loaded.',
          progress: {
            completed: completeVisibility ? steps.filter((task) => task?.terminal_at).length : null,
            total: descriptor.steps.length,
            unit: 'steps',
          },
          source: 'workflow',
          host: 'Ordered execution',
          placement: `${descriptor.steps.length} ordered ${descriptor.steps.length === 1 ? 'step' : 'steps'}`,
          workspaceLabel: workspaceLabelText(workspaceLabelFields),
          workspaceLabelFields,
          workspaceId,
          targetSessionId: tool.session_id,
          updatedAt: tool.completed_at || tool.started_at || session?.updated_at || '',
          workflow: tool,
        },
      ];
    }),
  );
}

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function RunsPage() {
  const location = useLocation();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [category, setCategory] = useState<'executions' | 'workflows'>('executions');
  const [requestedCancellation, setRequestedCancellation] = useState<Set<string>>(new Set());
  const [workflowScanLimit, setWorkflowScanLimit] = useState(WORKFLOW_SCAN_BATCH);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('active');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [confirmedAction, setConfirmedAction] = useState<ConfirmedRunAction>();
  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const sessions = useQuery({
    queryKey: queryKeys.key('sessions', settings.endpoint, 'all'),
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const runs = useInfiniteQuery({
    queryKey: queryKeys.key(
      'tasks',
      settings.endpoint,
      category === 'executions' && stateFilter === 'active',
    ),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.queryTasks(
        { cursor: pageParam, activeOnly: category === 'executions' && stateFilter === 'active' },
        signal,
      ),
    getNextPageParam: (page) => page.cursor ?? undefined,
    refetchInterval: RUNS_POLL_MS,
  });
  const tasks = useMemo(
    () => [
      ...new Map(
        (runs.data?.pages.flatMap((page) => page.tasks) ?? []).map((task) => [task.handle, task]),
      ).values(),
    ],
    [runs.data],
  );
  const orderedWorkflowSessions = useMemo(() => {
    const current = sessionIdFromRoute(returnRouteFromState(location.state, settings.endpoint));
    const values = sessions.data ?? [];
    return current
      ? [...values].sort(
          (left, right) => Number(right.id === current) - Number(left.id === current),
        )
      : values;
  }, [location.state, sessions.data, settings.endpoint]);
  const workflowTranscripts = useQueries({
    queries: orderedWorkflowSessions.map((session, index) => ({
      enabled: category === 'workflows' && index < workflowScanLimit,
      queryKey: queryKeys.key('transcript', settings.endpoint, session.id),
      queryFn: ({ signal }: { signal: AbortSignal }) => repository.transcript(session.id, signal),
      staleTime: RUNS_POLL_MS,
    })),
  });
  const refreshRuns = useCallback(
    () => queryClient.invalidateQueries({ queryKey: queryKeys.key('tasks', settings.endpoint) }),
    [queryClient, settings.endpoint],
  );
  const cancel = useMutation({
    mutationFn: (row: RunRow) => {
      if (!row.ownerSessionId) throw new Error('The task owner is unavailable');
      setRequestedCancellation((previous) => new Set([...previous, row.handleId]));
      return repository.cancelTasks(row.ownerSessionId, [row.handleId]);
    },
    onSuccess: async () => {
      setConfirmedAction(undefined);
      await refreshRuns();
      toast.success('Cancellation requested');
    },
    onError: (error, row) => {
      setRequestedCancellation(
        (previous) => new Set([...previous].filter((id) => id !== row.handleId)),
      );
      toast.error(error.message);
    },
  });
  const executionRows = useMemo(
    () => buildRows(tasks, sessions.data ?? [], workspaces.data ?? []),
    [tasks, sessions.data, workspaces.data],
  );
  const workflowRows = useMemo(
    () =>
      buildWorkflowRows(
        workflowTranscripts.flatMap((query) => (query.data ? [query.data] : [])),
        sessions.data ?? [],
        workspaces.data ?? [],
        tasks,
      ),
    [sessions.data, workflowTranscripts, workspaces.data, tasks],
  );
  const rows = category === 'workflows' ? workflowRows : executionRows;
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const stateMatches =
        stateFilter === 'all' ||
        row.state === stateFilter ||
        (stateFilter === 'active' &&
          !['completed', 'failed', 'cancelled', 'interrupted'].includes(row.state)) ||
        (stateFilter === 'attention' &&
          ['failed', 'interrupted', 'waiting_permission', 'waiting_user'].includes(row.state));
      const sourceMatches =
        category === 'workflows' || sourceFilter === 'all' || row.source === sourceFilter;
      const searchMatches =
        !query ||
        [
          row.label,
          row.workspaceLabel,
          row.state,
          row.reportedStatus,
          row.host,
          row.placement,
          row.taskId,
        ]
          .join(' ')
          .toLowerCase()
          .includes(query);
      return stateMatches && sourceMatches && searchMatches;
    });
  }, [category, rows, search, sourceFilter, stateFilter]);
  const columns = useMemo<ColumnDef<DataGridFeatures, RunRow, unknown>[]>(
    () => [
      {
        accessorKey: 'label',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Run" />,
        cell: ({ row }) => (
          <div className="min-w-56 py-0.5">
            {row.original.workspaceId && row.original.targetSessionId ? (
              <Link
                className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:text-primary hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                to={`${`/workspaces/${encodeURIComponent(row.original.workspaceId)}/sessions/${encodeURIComponent(row.original.targetSessionId)}`}${row.original.workflow ? `?workflow=${encodeURIComponent(row.original.workflow.id)}` : ''}`}
              >
                {truncate(row.original.label, 80)}
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              </Link>
            ) : (
              <span className="font-medium">{row.original.label}</span>
            )}
            {row.original.taskKind && (
              <p className="text-xs text-muted-foreground">{row.original.taskKind}</p>
            )}
            <details className="mt-1 max-w-80 text-xs">
              <summary className="cursor-pointer text-muted-foreground">Details</summary>
              <p className="mt-2 whitespace-pre-wrap break-words">{row.original.assignment}</p>
              <p className="mt-2 break-all font-mono">{row.original.taskId}</p>
              <p className="text-muted-foreground">Backend: {row.original.reportedStatus}</p>
            </details>
          </div>
        ),
        meta: { autoSize: true, headerTitle: 'Run' },
      },
      {
        accessorKey: 'state',
        header: ({ column }) => <DataGridColumnHeader column={column} title="State" />,
        cell: ({ row }) => (
          <div className="max-w-72 space-y-1.5 py-1">
            <ClioStatus
              detail={row.original.statusReason}
              label={
                (row.original.cancelRequested ||
                  requestedCancellation.has(row.original.handleId)) &&
                !['completed', 'failed', 'cancelled', 'interrupted'].includes(row.original.state)
                  ? 'Cancellation requested'
                  : undefined
              }
              value={row.original.state}
            />
            {taskProgressLabel(row.original.progress, row.original.taskKind) && (
              <p className="text-xs text-muted-foreground">
                {taskProgressLabel(row.original.progress, row.original.taskKind)}
              </p>
            )}
            {row.original.statusReason ? (
              <p
                className="line-clamp-2 text-xs text-destructive"
                title={row.original.statusReason}
              >
                {row.original.statusReason}
              </p>
            ) : null}
          </div>
        ),
        meta: { autoSize: true, headerTitle: 'State' },
      },
      {
        accessorKey: 'source',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Execution" />,
        cell: ({ row }) => (
          <div className="max-w-52 py-0.5">
            <p className="text-sm">{sourceLabels[row.original.source]}</p>
            <p className="truncate text-xs text-muted-foreground" title={row.original.placement}>
              {row.original.workflow
                ? row.original.placement
                : row.original.host || 'Host unavailable'}
            </p>
          </div>
        ),
        meta: { headerTitle: 'Execution' },
      },
      {
        accessorKey: 'workspaceLabel',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title={capitalize(vocab.workspace)} />
        ),
        cell: ({ row }) => (
          <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm">
            <span>{row.original.workspaceLabelFields.name}</span>
            {row.original.workspaceLabelFields.qualifiers.map((qualifier) => (
              <span className="text-xs text-muted-foreground" key={qualifier}>
                {qualifier}
              </span>
            ))}
          </span>
        ),
        meta: { headerTitle: capitalize(vocab.workspace) },
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Updated" />,
        cell: ({ row }) => (
          <time
            className="whitespace-nowrap text-xs text-muted-foreground"
            dateTime={row.original.updatedAt}
          >
            {formatWhen(row.original.updatedAt)}
          </time>
        ),
        meta: { headerTitle: 'Updated' },
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <RunActions
            onCancel={() => setConfirmedAction({ kind: 'cancel', row: row.original })}
            pending={cancel.isPending && cancel.variables?.handleId === row.original.handleId}
            row={{
              ...row.original,
              cancelRequested:
                row.original.cancelRequested || requestedCancellation.has(row.original.handleId),
            }}
          />
        ),
        meta: { autoSize: true, headerTitle: 'Actions' },
      },
    ],
    [cancel.isPending, cancel.variables, requestedCancellation],
  );
  const table = useTable({ columns, data: filteredRows, features: dataGridFeatures });
  const workflowError = workflowTranscripts.find((query) => query.error)?.error;
  const error =
    category === 'workflows'
      ? (sessions.error ?? workspaces.error ?? (workflowRows.length === 0 ? workflowError : null))
      : (runs.error ?? sessions.error ?? workspaces.error);
  const workflowsIndexed = workflowTranscripts.filter(
    (query) => query.data !== undefined || query.isError,
  ).length;
  const workflowsRemaining = Math.max(0, orderedWorkflowSessions.length - workflowsIndexed);
  const workflowsIndexing = workflowTranscripts
    .slice(0, workflowScanLimit)
    .some((query) => query.isFetching);
  const workflowFailures = workflowTranscripts.filter((query) => query.isError).length;

  return (
    <main className="clio-scrollbar h-full min-h-0 overflow-y-auto bg-background p-4 sm:p-6 lg:p-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
              Operations
            </p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight">Runs</h1>
            <p className="mt-2 text-muted-foreground">
              Track operational handles and recorded multi-step workflow executions.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={returnRouteFromState(location.state, settings.endpoint)}>
              <ChevronLeftIcon aria-hidden="true" /> {capitalize(vocab.workspace)}
            </Link>
          </Button>
        </div>
        <Tabs
          className="mt-8"
          onValueChange={(value) => setCategory(value as 'executions' | 'workflows')}
          value={category}
        >
          <TabsList aria-label="Run categories">
            <TabsTrigger value="executions">
              <ActivityIcon aria-hidden="true" /> Executions
              <Badge className="ml-1" variant="secondary">
                {executionRows.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="workflows">
              <WorkflowIcon aria-hidden="true" /> Workflows
              <Badge className="ml-1" variant="secondary">
                {workflowRows.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search runs"
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                category === 'workflows'
                  ? 'Search workflow, step, workspace, or state'
                  : 'Search run, workspace, state, host, or task'
              }
              value={search}
            />
          </div>
          <Select onValueChange={setStateFilter} value={stateFilter}>
            <SelectTrigger aria-label="Filter by state" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="waiting_user">Waiting for you</SelectItem>
              <SelectItem value="attention">Needs attention</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          {category === 'executions' ? (
            <Select onValueChange={setSourceFilter} value={sourceFilter}>
              <SelectTrigger aria-label="Filter by execution type" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All execution</SelectItem>
                <SelectItem value="agent_task">Agents</SelectItem>
                <SelectItem value="mcp_task">Tools</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <Badge variant="secondary">
            {filteredRows.length} {category === 'workflows' ? 'workflows' : 'runs'}
          </Badge>
        </div>
        {category === 'workflows' ? (
          <Alert className="mt-6">
            <WorkflowIcon aria-hidden="true" />
            <AlertTitle>Recorded workflow executions</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Each row is reconstructed from a recorded run_workflow call and its authoritative
                ordered step task IDs. Open one to inspect its execution graph in the workspace
                canvas.
                {workflowsRemaining > 0
                  ? ` ${workflowsIndexed} of ${orderedWorkflowSessions.length} sessions indexed.`
                  : ''}
                {workflowFailures > 0
                  ? ` ${workflowFailures} session${workflowFailures === 1 ? '' : 's'} could not be indexed.`
                  : ''}
              </span>
              {workflowScanLimit < orderedWorkflowSessions.length ? (
                <Button
                  disabled={workflowsIndexing}
                  onClick={() =>
                    setWorkflowScanLimit((current) =>
                      Math.min(current + WORKFLOW_SCAN_BATCH, orderedWorkflowSessions.length),
                    )
                  }
                  size="sm"
                  variant="outline"
                >
                  {workflowsIndexing ? 'Indexing…' : 'Index more sessions'}
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert className="mt-6" variant="destructive">
            <ActivityIcon aria-hidden="true" />
            <AlertTitle>Run explorer unavailable</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <DataGrid
            emptyMessage="No runs match the current search and filters."
            isLoading={
              sessions.isPending ||
              workspaces.isPending ||
              (category === 'executions'
                ? runs.isPending
                : workflowRows.length === 0 && workflowsIndexing)
            }
            recordCount={filteredRows.length}
            table={table}
            tableLayout={{
              columnsResizable: true,
              dense: true,
              headerSticky: true,
              width: 'fixed',
            }}
          >
            <DataGridContainer className="mt-6 rounded-xl border bg-card">
              <ClioDataGridTable />
              <div className="border-t px-4">
                <DataGridPagination sizes={DATA_GRID_PAGE_SIZES} />
              </div>
            </DataGridContainer>
          </DataGrid>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {runs.data?.pages[0]?.total == null
              ? `${tasks.length} tasks loaded`
              : `Showing ${tasks.length} of ${runs.data.pages[0].total} tasks`}
            . Search covers loaded results.
          </span>
          {runs.hasNextPage ? (
            <Button
              size="sm"
              variant="outline"
              disabled={runs.isFetchingNextPage}
              onClick={() => void runs.fetchNextPage()}
            >
              {runs.isFetchingNextPage ? 'Loading…' : 'Load more tasks'}
            </Button>
          ) : null}
        </div>
      </div>
      <AlertDialog
        onOpenChange={(open) => !open && setConfirmedAction(undefined)}
        open={Boolean(confirmedAction)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this task?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmedAction
                ? `${truncate(confirmedAction.row.assignment || confirmedAction.row.label, 240)}. ${confirmedAction.row.source === 'agent_task' ? 'This also cancels all descendant agents, downloads and shell processes.' : 'The owner will settle cancellation after required cleanup.'}`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep run</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancel.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!confirmedAction) return;
                cancel.mutate(confirmedAction.row);
              }}
              variant="destructive"
            >
              {cancel.isPending ? 'Requesting cancellation…' : 'Cancel task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
