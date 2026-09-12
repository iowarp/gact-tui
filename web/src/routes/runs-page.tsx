import { queryKeys } from '@/lib/query-keys';
import { truncate } from '@/lib/format';
import {
  DATA_GRID_PAGE_SIZES,
  OPERATIONS_POLL_MS,
  RUN_REASON_TRUNCATE_CHARS,
  RUNS_POLL_MS,
} from '@/lib/runtime-limits';
import type {
  OperationalRun,
  RunState,
  Session,
  ToolInvocation,
  TranscriptSnapshot,
  Workspace,
} from '@clio/core/v3';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import {
  ActivityIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PlugZapIcon,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import {
  workspaceLabels,
  workspaceLabelText,
  type WorkspaceDisplayLabel,
} from '@/lib/workspace-labels';
import { useConnectionSettings } from '@/providers/connection-provider';
import { returnRouteFromState, sessionIdFromRoute } from '@/lib/workspace-route-memory';
import { workflowDescriptor } from '@/components/clio/workflow-tool-presentation';

type RunSource = OperationalRun['source'] | 'workflow';
const WORKFLOW_SCAN_BATCH = 4;

interface RunRow {
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
  detached: boolean;
  workflow?: ToolInvocation;
}

type ConfirmedRunAction = { kind: 'cancel' | 'dismiss'; row: RunRow };

const sourceLabels: Record<RunSource, string> = {
  agent_task: 'Agent',
  mcp_task: 'Tool',
  relay_job: 'Remote job',
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
  runs: readonly OperationalRun[],
  sessions: readonly Session[],
  workspaces: readonly Workspace[],
): RunRow[] {
  const labels = workspaceLabels(workspaces);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return runs.map((run) => {
    const targetSessionId = run.child_session_id || run.parent_session_id || undefined;
    const targetSession = targetSessionId ? sessionsById.get(targetSessionId) : undefined;
    const parentSession = sessionsById.get(run.parent_session_id);
    const workspaceId = targetSession?.workspace_id ?? parentSession?.workspace_id;
    const workspaceLabelFields = workspaceId
      ? (labels.get(workspaceId) ?? { name: 'Workspace unavailable', qualifiers: [] })
      : { name: 'Workspace unavailable', qualifiers: [] };
    return {
      handleId: run.handle_id,
      taskId: run.task_id,
      label: run.run_label || 'Unnamed run',
      state: run.live_state,
      reportedStatus: run.status,
      statusReason: conciseReason(run.status_reason),
      source: run.source,
      host: run.host,
      placement: run.placement,
      workspaceLabel: workspaceLabelText(workspaceLabelFields),
      workspaceLabelFields,
      workspaceId,
      targetSessionId,
      updatedAt: run.updated_at,
      detached: run.detached,
    };
  });
}

function workflowState(tool: ToolInvocation): RunState {
  if (tool.state === 'pending') return 'queued';
  if (tool.state === 'running') return 'running';
  if (tool.state === 'succeeded') return 'completed';
  if (tool.state === 'failed') return 'failed';
  if (tool.state === 'cancelled' || tool.state === 'denied') return 'cancelled';
  return 'unknown';
}

// Pure indexing keeps transcript-derived workflow identity deterministic and testable.
// oxlint-disable-next-line react/only-export-components
export function buildWorkflowRows(
  transcripts: readonly TranscriptSnapshot[],
  sessions: readonly Session[],
  workspaces: readonly Workspace[],
): RunRow[] {
  const labels = workspaceLabels(workspaces);
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return transcripts.flatMap((transcript) =>
    Object.values(transcript.tools).flatMap((tool): RunRow[] => {
      const descriptor = workflowDescriptor(tool);
      if (!descriptor) return [];
      const session = sessionsById.get(tool.session_id);
      const workspaceId = session?.workspace_id;
      const workspaceLabelFields = workspaceId
        ? (labels.get(workspaceId) ?? { name: 'Workspace unavailable', qualifiers: [] })
        : { name: 'Workspace unavailable', qualifiers: [] };
      return [
        {
          handleId: tool.id,
          taskId: tool.id,
          label: descriptor.label,
          state: workflowState(tool),
          reportedStatus: tool.state,
          source: 'workflow',
          host: 'Ordered execution',
          placement: `${descriptor.steps.length} ordered ${descriptor.steps.length === 1 ? 'step' : 'steps'}`,
          workspaceLabel: workspaceLabelText(workspaceLabelFields),
          workspaceLabelFields,
          workspaceId,
          targetSessionId: tool.session_id,
          updatedAt: tool.completed_at || tool.started_at || session?.updated_at || '',
          detached: false,
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
  const [workflowScanLimit, setWorkflowScanLimit] = useState(WORKFLOW_SCAN_BATCH);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
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
  const runs = useQuery({
    queryKey: queryKeys.key('runs', settings.endpoint),
    queryFn: ({ signal }) => repository.runs(signal),
    refetchInterval: RUNS_POLL_MS,
  });
  const relay = useQuery({
    queryKey: queryKeys.key('relay-status', settings.endpoint),
    queryFn: ({ signal }) => repository.relayStatus(signal),
    refetchInterval: OPERATIONS_POLL_MS,
  });
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
    () => queryClient.invalidateQueries({ queryKey: queryKeys.key('runs', settings.endpoint) }),
    [queryClient, settings.endpoint],
  );
  const detach = useMutation({
    mutationFn: (handleId: string) => repository.detachRun(handleId),
    onSuccess: async () => {
      await refreshRuns();
      toast.success('Run detached from active monitoring');
    },
    onError: (error) => toast.error(error.message),
  });
  const dismiss = useMutation({
    mutationFn: (handleId: string) => repository.dismissRun(handleId),
    onSuccess: async () => {
      setConfirmedAction(undefined);
      await refreshRuns();
      toast.success('Run removed from the explorer');
    },
    onError: (error) => toast.error(error.message),
  });
  const cancel = useMutation({
    mutationFn: (taskId: string) => repository.cancelAgentTask(taskId),
    onSuccess: async () => {
      setConfirmedAction(undefined);
      await refreshRuns();
      toast.success('Child-agent cancellation requested');
    },
    onError: (error) => toast.error(error.message),
  });
  const executionRows = useMemo(
    () => buildRows(runs.data ?? [], sessions.data ?? [], workspaces.data ?? []),
    [runs.data, sessions.data, workspaces.data],
  );
  const workflowRows = useMemo(
    () =>
      buildWorkflowRows(
        workflowTranscripts.flatMap((query) => (query.data ? [query.data] : [])),
        sessions.data ?? [],
        workspaces.data ?? [],
      ),
    [sessions.data, workflowTranscripts, workspaces.data],
  );
  const rows = category === 'workflows' ? workflowRows : executionRows;
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const stateMatches =
        stateFilter === 'all' ||
        row.state === stateFilter ||
        (stateFilter === 'active' && ['queued', 'running'].includes(row.state)) ||
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
                {row.original.label}
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              </Link>
            ) : (
              <span className="font-medium">{row.original.label}</span>
            )}
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {row.original.workflow ? `workflow ${row.original.taskId}` : row.original.taskId}
            </p>
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
              label={row.original.reportedStatus.replaceAll('_', ' ')}
              value={row.original.state}
            />
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
              {row.original.detached ? ', detached' : ''}
            </p>
          </div>
        ),
        meta: { headerTitle: 'Execution' },
      },
      {
        accessorKey: 'workspaceLabel',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Workspace" />,
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
        meta: { headerTitle: 'Workspace' },
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
            onDetach={() => detach.mutate(row.original.handleId)}
            onDismiss={() => setConfirmedAction({ kind: 'dismiss', row: row.original })}
            pending={detach.isPending && detach.variables === row.original.handleId}
            row={row.original}
          />
        ),
        meta: { autoSize: true, headerTitle: 'Actions' },
      },
    ],
    [detach],
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
    <main className="min-h-dvh bg-background p-4 sm:p-6 lg:p-10">
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
              <ChevronLeftIcon aria-hidden="true" /> Workspace
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
                <SelectItem value="relay_job">Remote jobs</SelectItem>
              </SelectContent>
            </Select>
          ) : null}
          <Badge variant="secondary">
            {filteredRows.length} {category === 'workflows' ? 'workflows' : 'runs'}
          </Badge>
        </div>
        {category === 'executions' ? (
          <Alert className="mt-6">
            <PlugZapIcon aria-hidden="true" />
            <AlertTitle>
              {relay.isPending
                ? 'Checking remote execution'
                : relay.data?.reachable
                  ? 'Remote execution is reachable'
                  : relay.data?.configured
                    ? 'Remote execution needs attention'
                    : 'Remote execution is not configured'}
            </AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {relay.error?.message ||
                  relay.data?.detail ||
                  relay.data?.reason ||
                  relay.data?.host ||
                  'This service has not advertised a remote execution connection.'}
              </span>
              <Button asChild size="sm" variant="outline">
                <Link to="/settings/relays">Open remote execution settings</Link>
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
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
        )}
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
      </div>
      <AlertDialog
        onOpenChange={(open) => !open && setConfirmedAction(undefined)}
        open={Boolean(confirmedAction)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmedAction?.kind === 'cancel'
                ? 'Cancel child-agent work?'
                : 'Dismiss this run?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmedAction?.kind === 'cancel'
                ? 'The server will request cancellation from the child agent using its authoritative task handle. Completed work and evidence remain available.'
                : 'This removes the settled or detached handle from the run explorer. It does not delete its session, transcript, or artifacts.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep run</AlertDialogCancel>
            <AlertDialogAction
              disabled={dismiss.isPending || cancel.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (!confirmedAction) return;
                if (confirmedAction.kind === 'cancel') cancel.mutate(confirmedAction.row.taskId);
                else dismiss.mutate(confirmedAction.row.handleId);
              }}
              variant="destructive"
            >
              {dismiss.isPending || cancel.isPending
                ? 'Working…'
                : confirmedAction?.kind === 'cancel'
                  ? 'Cancel child agent'
                  : 'Dismiss run'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function RunActions({
  onCancel,
  onDetach,
  onDismiss,
  pending,
  row,
}: {
  onCancel: () => void;
  onDetach: () => void;
  onDismiss: () => void;
  pending: boolean;
  row: RunRow;
}) {
  const active = ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(row.state);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={`Actions for ${row.label}`}
          disabled={pending}
          size="icon-sm"
          variant="outline"
        >
          <MoreHorizontalIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Run actions</DropdownMenuLabel>
        {row.workspaceId && row.targetSessionId ? (
          <DropdownMenuItem asChild>
            <Link
              to={`${`/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(row.targetSessionId)}`}${row.workflow ? `?workflow=${encodeURIComponent(row.workflow.id)}` : ''}`}
            >
              {row.workflow ? 'Open workflow graph' : 'Open conversation'}
            </Link>
          </DropdownMenuItem>
        ) : null}
        {row.workflow && row.workspaceId && row.targetSessionId ? (
          <DropdownMenuItem asChild>
            <Link
              to={`/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(row.targetSessionId)}`}
            >
              Open conversation
            </Link>
          </DropdownMenuItem>
        ) : null}
        {!row.workflow && active && !row.detached ? (
          <DropdownMenuItem onSelect={onDetach}>Detach from active monitoring</DropdownMenuItem>
        ) : null}
        {active && row.source === 'agent_task' ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCancel} variant="destructive">
              Cancel child agent…
            </DropdownMenuItem>
          </>
        ) : null}
        {!row.workflow && (!active || row.detached) ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDismiss} variant="destructive">
              Dismiss from explorer…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
