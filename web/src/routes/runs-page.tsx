import { queryKeys } from '@/lib/query-keys';
import { truncate } from '@/lib/format';
import { RUNS_POLL_MS } from '@/lib/runtime-limits';
import type { Session } from '@clio/core/v3';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { ActivityIcon, ChevronLeftIcon, SearchIcon, WorkflowIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { FrameDivider } from '@/components/clio/primitives/frame-bar';
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { SegmentedControl } from '@/components/clio/primitives/segmented-control';
import { StateView } from '@/components/clio/primitives/state-view';
import { RunActions } from '@/components/clio/run-actions';
import { RunListRow } from '@/components/clio/run-list-row';
import { RUN_GROUP_LABELS, runGroup, type RunGroup } from '@/components/clio/run-presentation';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { returnRouteFromState, sessionIdFromRoute } from '@/lib/workspace-route-memory';
import { buildFlowRows, buildRows, retainFlowTools, type RunRow } from '@/routes/runs-rows';
import { matchesRunState } from '@/lib/session-agent-tasks';

const FLOW_SCAN_BATCH = 4;
/** Conversations read per page for the flow index (a few scan batches). */
const FLOW_SESSION_PAGE = 20;
type ConfirmedRunAction = { kind: 'cancel'; row: RunRow };

/** Rows drawn at once; more appear on request so a long history stays light. */
const RUN_ROW_STEP = 150;
const RUN_GROUP_ORDER: readonly RunGroup[] = ['needs-you', 'running', 'queued', 'earlier'];
const STATE_OPTIONS = [
  { value: 'all', label: 'All states' },
  { value: 'active', label: 'Active' },
  { value: 'waiting_user', label: 'Waiting for you' },
  { value: 'attention', label: 'Needs attention' },
  { value: 'completed', label: 'Completed' },
] as const;
const SOURCE_OPTIONS = [
  { value: 'all', label: 'All execution' },
  { value: 'agent_task', label: 'Agents' },
  { value: 'mcp_task', label: 'Tools' },
] as const;
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
  // Flows are indexed from conversations a page at a time, newest first (never
  // every session); the open conversation, when there is one, is read first.
  const currentFlowSession = sessionIdFromRoute(
    returnRouteFromState(location.state, settings.endpoint),
  );
  const flowSessionPages = useInfiniteQuery({
    queryKey: queryKeys.key('session-pages', settings.endpoint, 'runs-flows'),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.sessionPage({ limit: FLOW_SESSION_PAGE, cursor: pageParam }, signal),
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    enabled: category === 'flows',
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
  // The sessions the shown rows name (task owners, the open conversation), by id.
  const namedSessionIds = useMemo(
    () =>
      [
        ...new Set(
          [currentFlowSession, ...tasks.map((task) => task.owner.session_id)].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ].toSorted(),
    [currentFlowSession, tasks],
  );
  const namedSessions = useQuery({
    queryKey: queryKeys.key('session-directory', settings.endpoint, ...namedSessionIds),
    queryFn: ({ signal }) => repository.sessionsById(namedSessionIds, signal),
    enabled: namedSessionIds.length > 0,
    placeholderData: keepPreviousData,
  });
  const pagedFlowSessions = useMemo(
    () => flowSessionPages.data?.pages.flatMap((page) => page.sessions) ?? [],
    [flowSessionPages.data],
  );
  const flowSessionTotal = flowSessionPages.data?.pages[0]?.total ?? pagedFlowSessions.length;
  const orderedFlowSessions = useMemo(() => {
    const current = namedSessions.data?.find((session) => session.id === currentFlowSession);
    return current
      ? [current, ...pagedFlowSessions.filter((session) => session.id !== current.id)]
      : pagedFlowSessions;
  }, [currentFlowSession, namedSessions.data, pagedFlowSessions]);
  const sessions = useMemo(() => {
    const byId = new Map<string, Session>();
    for (const session of [...orderedFlowSessions, ...(namedSessions.data ?? [])]) {
      byId.set(session.id, session);
    }
    return {
      data: [...byId.values()],
      error: namedSessions.error ?? flowSessionPages.error,
      isPending:
        (namedSessionIds.length > 0 && namedSessions.isPending) ||
        (category === 'flows' && flowSessionPages.isPending),
    };
  }, [
    category,
    flowSessionPages.error,
    flowSessionPages.isPending,
    namedSessionIds.length,
    namedSessions.data,
    namedSessions.error,
    namedSessions.isPending,
    orderedFlowSessions,
  ]);
  const flowTranscripts = useQueries({
    queries: orderedFlowSessions.map((session, index) => ({
      enabled: category === 'flows' && index < flowScanLimit,
      queryKey: queryKeys.transcript(settings.endpoint, session.id, 'flow-tools'),
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        retainFlowTools(await repository.transcript(session.id, signal)),
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
  const [visibleLimit, setVisibleLimit] = useState(RUN_ROW_STEP);
  const shownRows = useMemo(
    () => filteredRows.slice(0, visibleLimit),
    [filteredRows, visibleLimit],
  );
  const flowError = flowTranscripts.find((query) => query.error)?.error;
  const error =
    category === 'flows'
      ? (sessions.error ?? workspaces.error ?? (flowRows.length === 0 ? flowError : null))
      : (runs.error ?? sessions.error ?? workspaces.error);
  const flowsIndexed = flowTranscripts.filter(
    (query) => query.data !== undefined || query.isError,
  ).length;
  const flowsRemaining = Math.max(0, flowSessionTotal - flowsIndexed);
  const flowsIndexing = flowTranscripts.slice(0, flowScanLimit).some((query) => query.isFetching);
  const flowFailures = flowTranscripts.filter((query) => query.isError).length;
  const loading =
    sessions.isPending ||
    workspaces.isPending ||
    (category === 'executions' ? runs.isPending : flowRows.length === 0 && flowsIndexing);
  const groups = useMemo(() => {
    const byGroup = new Map<RunGroup, RunRow[]>();
    for (const row of shownRows) {
      const group = runGroup(row.state);
      const list = byGroup.get(group);
      if (list) list.push(row);
      else byGroup.set(group, [row]);
    }
    return RUN_GROUP_ORDER.flatMap((group) => {
      const groupRows = byGroup.get(group);
      return groupRows ? [{ group, rows: groupRows }] : [];
    });
  }, [shownRows]);
  const noun = category === 'flows' ? 'flows' : 'runs';

  return (
    <main className="flex h-full min-h-0 flex-col bg-background">
      <div className="@container/runbar flex h-11 min-w-0 shrink-0 items-center gap-2 border-b border-border px-2 whitespace-nowrap sm:px-3">
        <NamedTooltip label={`Back to ${vocab.workspace}`}>
          <Button asChild className="text-muted-foreground" size="icon-sm" variant="ghost">
            <Link
              aria-label={`Back to ${vocab.workspace}`}
              to={returnRouteFromState(location.state, settings.endpoint)}
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Link>
          </Button>
        </NamedTooltip>
        <h1 className="shrink-0 text-[13px] font-semibold">Runs</h1>
        <FrameDivider className="hidden @[520px]/runbar:block" />
        <SegmentedControl
          label="Run categories"
          onValueChange={setCategory}
          options={[
            {
              value: 'executions',
              label: `Executions ${executionRows.length}`,
              icon: <ActivityIcon aria-hidden="true" />,
            },
            {
              value: 'flows',
              label: `Flows ${flowRows.length}`,
              icon: <WorkflowIcon aria-hidden="true" />,
            },
          ]}
          value={category}
        />
        <SegmentedControl
          className="hidden @[1080px]/runbar:flex"
          label="Filter by state"
          onValueChange={setStateFilter}
          options={STATE_OPTIONS}
          value={stateFilter}
        />
        <Select onValueChange={setStateFilter} value={stateFilter}>
          <SelectTrigger
            aria-label="Filter by state"
            className="h-7! w-36 shrink-0 text-[12px] @[1080px]/runbar:hidden"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {category === 'executions' ? (
          <SegmentedControl
            className="hidden @[1240px]/runbar:flex"
            label="Filter by execution type"
            onValueChange={setSourceFilter}
            options={SOURCE_OPTIONS}
            value={sourceFilter}
          />
        ) : null}
        <div className="relative ml-auto min-w-24 max-w-56 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search runs"
            className="h-7 pl-7 text-[12px]"
            onChange={(event) => setSearch(event.target.value)}
            placeholder={category === 'flows' ? 'Search flows' : 'Search runs'}
            title={
              category === 'flows'
                ? 'Search flow, workspace, or state'
                : 'Search run, workspace, state, host, or task'
            }
            value={search}
          />
        </div>
        <span className="hidden w-16 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums @[680px]/runbar:inline">
          {filteredRows.length} {noun}
        </span>
      </div>
      {category === 'flows' ? (
        <div className="flex h-8 min-w-0 shrink-0 items-center gap-2 border-b border-border px-3 text-[12px] whitespace-nowrap text-muted-foreground">
          <WorkflowIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span
            className="min-w-0 flex-1 truncate"
            title="Each row is a flow an agent started in a conversation, with its task's current state. Open one to see its steps and any stall in the workspace canvas."
          >
            Flows agents started in conversations
            {flowsRemaining > 0 ? `, ${flowsIndexed} of ${flowSessionTotal} sessions indexed` : ''}
            {flowFailures > 0
              ? `, ${flowFailures} session${flowFailures === 1 ? '' : 's'} could not be indexed`
              : ''}
          </span>
          {flowScanLimit < orderedFlowSessions.length || flowSessionPages.hasNextPage ? (
            <Button
              disabled={flowsIndexing || flowSessionPages.isFetchingNextPage}
              onClick={() => {
                // Read the next page of conversations when the indexed ones run out.
                if (
                  flowScanLimit + FLOW_SCAN_BATCH > orderedFlowSessions.length &&
                  flowSessionPages.hasNextPage
                ) {
                  void flowSessionPages.fetchNextPage();
                }
                setFlowScanLimit((current) => current + FLOW_SCAN_BATCH);
              }}
              size="xs"
              variant="outline"
            >
              {flowsIndexing ? 'Indexing…' : 'Index more sessions'}
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="@container/runs clio-scrollbar min-h-0 flex-1 overflow-y-auto px-2 py-2 sm:px-3">
        {error ? (
          <StateView
            action={{ label: 'Retry', onClick: () => void refreshRuns() }}
            detail={error.message}
            kind="error"
            title="Run explorer unavailable"
          />
        ) : loading ? (
          <StateView kind="loading" title={`Loading ${noun}`} />
        ) : filteredRows.length === 0 ? (
          <StateView kind="empty" title="No runs match the current search and filters." />
        ) : (
          groups.map(({ group, rows: groupRows }) => (
            <section aria-labelledby={`runs-group-${group}`} className="mb-2" key={group}>
              <h2
                className="flex h-6 items-center gap-2 px-1.5 text-[11px] font-medium text-muted-foreground"
                id={`runs-group-${group}`}
              >
                <span>{RUN_GROUP_LABELS[group]}</span>
                <span className="font-mono tabular-nums">{groupRows.length}</span>
              </h2>
              {groupRows.map((row) => {
                const cancelRequested =
                  Boolean(row.cancelRequested) || requestedCancellation.has(row.handleId);
                return (
                  <RunListRow
                    actions={
                      <RunActions
                        onCancel={() => setConfirmedAction({ kind: 'cancel', row })}
                        pending={cancel.isPending && cancel.variables?.handleId === row.handleId}
                        row={{ ...row, cancelRequested }}
                      />
                    }
                    cancelRequested={cancelRequested}
                    key={row.handleId}
                    row={row}
                  />
                );
              })}
            </section>
          ))
        )}
        <div className="mt-2 flex h-8 min-w-0 items-center gap-3 px-1.5 text-[12px] whitespace-nowrap text-muted-foreground">
          <span className="min-w-0 truncate">
            {runs.data?.pages[0]?.total == null
              ? `${tasks.length} tasks loaded`
              : `Showing ${tasks.length} of ${runs.data.pages[0].total} tasks`}
            . Search covers loaded results.
          </span>
          {filteredRows.length > visibleLimit ? (
            <Button
              className="ml-auto"
              onClick={() => setVisibleLimit((current) => current + RUN_ROW_STEP)}
              size="xs"
              variant="outline"
            >
              Show {Math.min(RUN_ROW_STEP, filteredRows.length - visibleLimit)} more
            </Button>
          ) : null}
          {runs.hasNextPage ? (
            <Button
              className={filteredRows.length > visibleLimit ? undefined : 'ml-auto'}
              disabled={runs.isFetchingNextPage}
              onClick={() => void runs.fetchNextPage()}
              size="xs"
              variant="outline"
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
