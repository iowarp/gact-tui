import type { OperationalRun, RunState, Session, Workspace } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import {
  ActivityIcon,
  ChevronLeftIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PlugZapIcon,
  SearchIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { ClioStatus } from '@/components/clio/status';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import { DataGridTable } from '@/components/reui/data-grid/data-grid-table';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { workspaceLabels } from '@/lib/workspace-labels';
import { useConnectionSettings } from '@/providers/connection-provider';
import { returnRouteFromState } from '@/lib/workspace-route-memory';

interface RunRow {
  handleId: string;
  taskId: string;
  label: string;
  state: RunState;
  reportedStatus: string;
  statusReason?: string;
  source: OperationalRun['source'];
  host: string;
  placement: string;
  workspaceLabel: string;
  workspaceId?: string;
  targetSessionId?: string;
  updatedAt: string;
  detached: boolean;
}

type ConfirmedRunAction = { kind: 'cancel' | 'dismiss'; row: RunRow };

const sourceLabels: Record<OperationalRun['source'], string> = {
  agent_task: 'Agent',
  mcp_task: 'Tool',
  relay_job: 'Remote job',
  unknown: 'Unknown source',
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
  return reason.length > 140 ? `${reason.slice(0, 137)}…` : reason;
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
      workspaceLabel: workspaceId
        ? (labels.get(workspaceId) ?? 'Workspace unavailable')
        : 'Workspace unavailable',
      workspaceId,
      targetSessionId,
      updatedAt: run.updated_at,
      detached: run.detached,
    };
  });
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
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [confirmedAction, setConfirmedAction] = useState<ConfirmedRunAction>();
  const workspaces = useQuery({
    queryKey: ['workspaces', settings.endpoint],
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const sessions = useQuery({
    queryKey: ['sessions', settings.endpoint, 'all'],
    queryFn: ({ signal }) => repository.allSessions(signal),
  });
  const runs = useQuery({
    queryKey: ['runs', settings.endpoint],
    queryFn: ({ signal }) => repository.runs(signal),
    refetchInterval: 5_000,
  });
  const relay = useQuery({
    queryKey: ['relay-status', settings.endpoint],
    queryFn: ({ signal }) => repository.relayStatus(signal),
    refetchInterval: 30_000,
  });
  const refreshRuns = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ['runs', settings.endpoint] }),
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
  const rows = useMemo(
    () => buildRows(runs.data ?? [], sessions.data ?? [], workspaces.data ?? []),
    [runs.data, sessions.data, workspaces.data],
  );
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const stateMatches =
        stateFilter === 'all' ||
        row.state === stateFilter ||
        (stateFilter === 'active' && ['queued', 'running'].includes(row.state)) ||
        (stateFilter === 'attention' &&
          ['failed', 'interrupted', 'waiting_permission', 'waiting_user'].includes(row.state));
      const sourceMatches = sourceFilter === 'all' || row.source === sourceFilter;
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
  }, [rows, search, sourceFilter, stateFilter]);
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
                to={`/workspaces/${encodeURIComponent(row.original.workspaceId)}/sessions/${encodeURIComponent(row.original.targetSessionId)}`}
              >
                {row.original.label}
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
              </Link>
            ) : (
              <span className="font-medium">{row.original.label}</span>
            )}
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {row.original.taskId}
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
              {row.original.host || 'Host unavailable'}
              {row.original.detached ? ', detached' : ''}
            </p>
          </div>
        ),
        meta: { headerTitle: 'Execution' },
      },
      {
        accessorKey: 'workspaceLabel',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Workspace" />,
        cell: ({ row }) => <span className="text-sm">{row.original.workspaceLabel}</span>,
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
  const error = runs.error ?? sessions.error ?? workspaces.error;

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
              Search live agent, tool, and remote execution handles reported by the server.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link to={returnRouteFromState(location.state, settings.endpoint)}>
              <ChevronLeftIcon aria-hidden="true" /> Workspace
            </Link>
          </Button>
        </div>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <SearchIcon
              aria-hidden="true"
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              aria-label="Search runs"
              className="pl-9"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search run, workspace, state, host, or task"
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
          <Badge variant="secondary">{filteredRows.length} runs</Badge>
        </div>
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
        {error ? (
          <Alert className="mt-6" variant="destructive">
            <ActivityIcon aria-hidden="true" />
            <AlertTitle>Run explorer unavailable</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : (
          <DataGrid
            emptyMessage="No runs match the current search and filters."
            isLoading={runs.isPending || sessions.isPending || workspaces.isPending}
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
              <DataGridTable />
              <div className="border-t px-4">
                <DataGridPagination sizes={[10, 25, 50, 100]} />
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
              to={`/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(row.targetSessionId)}`}
            >
              Open conversation
            </Link>
          </DropdownMenuItem>
        ) : null}
        {active && !row.detached ? (
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
        {!active || row.detached ? (
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
