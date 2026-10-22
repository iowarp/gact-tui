import { RunActions } from '@/components/clio/run-actions';
import { queryKeys } from '@/lib/query-keys';
import { truncate } from '@/lib/format';
import {
  DATA_GRID_PAGE_SIZES,
  RUN_REASON_TRUNCATE_CHARS,
  RUNS_POLL_MS,
} from '@/lib/runtime-limits';
import type { TaskSnapshot, RunState, Session, TranscriptSnapshot, Workspace } from '@clio/core/v3';
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
import { flowToolDescriptor } from '@/components/clio/flow-tool-presentation';
import { taskProgressLabel } from '@/components/clio/task-progress-label';
import { matchesRunState } from '@/lib/session-agent-tasks';

type RunSource = 'agent_task' | 'mcp_task' | 'unknown' | 'flow';
const FLOW_SCAN_BATCH = 4;

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
  statusDetail?: string;
  source: RunSource;
  host: string;
  placement: string;
  workspaceLabel: string;
  workspaceLabelFields: WorkspaceDisplayLabel;
  workspaceId?: string;
  targetSessionId?: string;
  updatedAt: string;
  /** The task handle of a flow run, opened in its conversation with `?flow=`. */
  flowHandle?: string;
}

type ConfirmedRunAction = { kind: 'cancel'; row: RunRow };

const sourceLabels: Record<RunSource, string> = {
  agent_task: 'Agent',
  mcp_task: 'Tool',
  unknown: 'Unknown source',
  flow: 'Flow',
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
    const statusDetail = ['failed', 'task_state_uncertain'].includes(run.status)
      ? run.progress.message || undefined
      : undefined;
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
      statusReason: conciseReason(statusDetail),
      statusDetail,
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

// Pure indexing keeps transcript-derived flow identity deterministic and testable.
// oxlint-disable-next-line react/only-export-components
export function buildFlowRows(
  transcripts: readonly TranscriptSnapshot[],
  sessions: readonly Session[],
  workspaces: readonly Workspace[],
  tasks: readonly TaskSnapshot[] = [],
): RunRow[] {
  const labels = workspaceLabels(workspaces);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return transcripts.flatMap((transcript) =>
    Object.values(transcript.tools).flatMap((tool): RunRow[] => {
      const flow = flowToolDescriptor(tool);
      if (!flow) return [];
      const session = sessionsById.get(tool.session_id);
      const workspaceId = session?.workspace_id;
      const task = flow.handle ? tasks.find((row) => row.handle === flow.handle) : undefined;
      const state: RunState = flow.refusal
        ? 'failed'
        : task
          ? taskState(task)
          : flow.handle
            ? 'unknown'
            : tool.state === 'failed'
              ? 'failed'
              : 'queued';
      const workspaceLabelFields = workspaceId
        ? (labels.get(workspaceId) ?? {
            name: `${capitalize(vocab.workspace)} unavailable`,
            qualifiers: [],
          })
        : { name: `${capitalize(vocab.workspace)} unavailable`, qualifiers: [] };
      return [
        {
          handleId: flow.handle ?? tool.id,
          taskId: flow.handle ?? tool.id,
          taskKind: task?.kind,
          label: `${flow.label} run`,
          state,
          reportedStatus: task ? task.raw_status || task.status : (flow.refusal?.reason ?? state),
          statusReason: flow.refusal
            ? conciseReason(flow.refusal.message)
            : flow.handle && !task
              ? 'The flow task status is not loaded.'
              : !flow.handle
                ? 'The flow has not been accepted yet.'
                : undefined,
          source: 'flow',
          host: 'Flow',
          placement: flow.flow,
          workspaceLabel: workspaceLabelText(workspaceLabelFields),
          workspaceLabelFields,
          workspaceId,
          targetSessionId: tool.session_id,
          updatedAt:
            task?.updated_at || tool.completed_at || tool.started_at || session?.updated_at || '',
          flowHandle: flow.handle,
          cancellable: task?.supported_actions.includes('cancel'),
          ownerSessionId: task?.owner.session_id,
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
  const [category, setCategory] = useState<'executions' | 'flows'>('executions');
  const [requestedCancellation, setRequestedCancellation] = useState<Set<string>>(new Set());
  const [flowScanLimit, setFlowScanLimit] = useState(FLOW_SCAN_BATCH);
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
  const orderedFlowSessions = useMemo(() => {
    const current = sessionIdFromRoute(returnRouteFromState(location.state, settings.endpoint));
    const values = sessions.data ?? [];
    return current
      ? [...values].sort(
          (left, right) => Number(right.id === current) - Number(left.id === current),
        )
      : values;
  }, [location.state, sessions.data, settings.endpoint]);
  const flowTranscripts = useQueries({
    queries: orderedFlowSessions.map((session, index) => ({
      enabled: category === 'flows' && index < flowScanLimit,
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
  const flowRows = useMemo(
    () =>
      buildFlowRows(
        flowTranscripts.flatMap((query) => (query.data ? [query.data] : [])),
        sessions.data ?? [],
        workspaces.data ?? [],
        tasks,
      ),
    [sessions.data, flowTranscripts, workspaces.data, tasks],
  );
  const rows = category === 'flows' ? flowRows : executionRows;
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const stateMatches = matchesRunState(row.state, stateFilter);
      const sourceMatches =
        category === 'flows' || sourceFilter === 'all' || row.source === sourceFilter;
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
                to={`${`/workspaces/${encodeURIComponent(row.original.workspaceId)}/sessions/${encodeURIComponent(row.original.targetSessionId)}`}${row.original.flowHandle ? `?flow=${encodeURIComponent(row.original.flowHandle)}` : ''}`}
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
              {row.original.statusDetail ? (
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
                  Reported issue: {row.original.statusDetail}
                </p>
              ) : null}
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
            {taskProgressLabel(
              row.original.progress,
              row.original.taskKind,
              row.original.statusDetail,
            ) && (
              <p className="line-clamp-2 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                {taskProgressLabel(
                  row.original.progress,
                  row.original.taskKind,
                  row.original.statusDetail,
                )}
              </p>
            )}
            {row.original.statusReason && row.original.state !== 'task_state_uncertain' ? (
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
              {row.original.source === 'flow'
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
  const flowError = flowTranscripts.find((query) => query.error)?.error;
  const error =
    category === 'flows'
      ? (sessions.error ?? workspaces.error ?? (flowRows.length === 0 ? flowError : null))
      : (runs.error ?? sessions.error ?? workspaces.error);
  const flowsIndexed = flowTranscripts.filter(
    (query) => query.data !== undefined || query.isError,
  ).length;
  const flowsRemaining = Math.max(0, orderedFlowSessions.length - flowsIndexed);
  const flowsIndexing = flowTranscripts.slice(0, flowScanLimit).some((query) => query.isFetching);
  const flowFailures = flowTranscripts.filter((query) => query.isError).length;

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
              Track operational handles and the flows agents started (workflows, councils and more).
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
          onValueChange={(value) => setCategory(value as 'executions' | 'flows')}
          value={category}
        >
          <TabsList aria-label="Run categories">
            <TabsTrigger value="executions">
              <ActivityIcon aria-hidden="true" /> Executions
              <Badge className="ml-1" variant="secondary">
                {executionRows.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="flows">
              <WorkflowIcon aria-hidden="true" /> Flows
              <Badge className="ml-1" variant="secondary">
                {flowRows.length}
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
                category === 'flows'
                  ? 'Search flow, workspace, or state'
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
            {filteredRows.length} {category === 'flows' ? 'flows' : 'runs'}
          </Badge>
        </div>
        {category === 'flows' ? (
          <Alert className="mt-6">
            <WorkflowIcon aria-hidden="true" />
            <AlertTitle>Flow runs</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Each row is a flow an agent started in a conversation, with its task&apos;s current
                state. Open one to see its steps and any stall in the workspace canvas.
                {flowsRemaining > 0
                  ? ` ${flowsIndexed} of ${orderedFlowSessions.length} sessions indexed.`
                  : ''}
                {flowFailures > 0
                  ? ` ${flowFailures} session${flowFailures === 1 ? '' : 's'} could not be indexed.`
                  : ''}
              </span>
              {flowScanLimit < orderedFlowSessions.length ? (
                <Button
                  disabled={flowsIndexing}
                  onClick={() =>
                    setFlowScanLimit((current) =>
                      Math.min(current + FLOW_SCAN_BATCH, orderedFlowSessions.length),
                    )
                  }
                  size="sm"
                  variant="outline"
                >
                  {flowsIndexing ? 'Indexing…' : 'Index more sessions'}
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
              (category === 'executions' ? runs.isPending : flowRows.length === 0 && flowsIndexing)
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
