import { queryKeys } from '@/lib/query-keys';
import { truncate } from '@/lib/format';
import { RUNS_POLL_MS } from '@/lib/runtime-limits';
import type { Session } from '@clio/core/v3';
import {
  keepPreviousData,
  replaceEqualDeep,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  ActivityIcon,
  BotIcon,
  CheckIcon,
  ListIcon,
  MessageCircleQuestionIcon,
  SearchIcon,
  TriangleAlertIcon,
  WorkflowIcon,
  WrenchIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useRef, useState, type RefObject } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { FilterChips } from '@/components/clio/primitives/filter-chips';
import { FrameDivider } from '@/components/clio/primitives/frame-bar';
import { RingSpinner } from '@/components/clio/primitives/ring-spinner';
import { ClioAppShell } from '@/components/clio/app-shell';
import { IconButton, NamedTooltip } from '@/components/clio/primitives/icon-button';
import { MenuRow } from '@/components/clio/primitives/menu-row';
import { SegmentedControl } from '@/components/clio/primitives/segmented-control';
import { StateView } from '@/components/clio/primitives/state-view';
import { RunActions } from '@/components/clio/run-actions';
import { RunListRow } from '@/components/clio/run-list-row';
import { RunTab } from '@/components/clio/run-tab';
import { RunsNavigation } from '@/components/clio/runs-navigation';
import {
  RUN_GROUP_LABELS,
  runGroup,
  runStateLabel,
  type RunGroup,
} from '@/components/clio/run-presentation';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  returnRouteFromState,
  sessionIdFromRoute,
  workspaceIdFromRoute,
} from '@/lib/workspace-route-memory';
import { buildFlowRows, buildRows, retainFlowTools, type RunRow } from '@/routes/runs-rows';
import { matchesRunState } from '@/lib/session-agent-tasks';
import { cn } from '@/lib/utils';
import { useShortcut } from '@/lib/shortcuts/hooks';

const FLOW_SCAN_BATCH = 4;
/** Conversations read per page for the flow index (a few scan batches). */
const FLOW_SESSION_PAGE = 20;
type ConfirmedRunAction = { kind: 'cancel'; row: RunRow };

/** Rows drawn at once; more appear on request so a long history stays light. */
const RUN_ROW_STEP = 150;
const RUN_GROUP_ORDER: readonly RunGroup[] = ['needs-you', 'running', 'queued', 'earlier'];
const STATE_OPTIONS = [
  { value: 'all', label: 'All states', icon: <ListIcon aria-hidden="true" /> },
  {
    value: 'active',
    label: 'Active',
    icon: <RingSpinner className="size-[9px]" />,
  },
  {
    value: 'waiting_user',
    label: 'Waiting for you',
    icon: <MessageCircleQuestionIcon aria-hidden="true" />,
  },
  { value: 'attention', label: 'Needs attention', icon: <TriangleAlertIcon aria-hidden="true" /> },
  { value: 'completed', label: 'Completed', icon: <CheckIcon aria-hidden="true" /> },
] as const;
/** The bar's execution-type chips; none chosen shows every type. */
const SOURCE_CHIPS = [
  { value: 'agent_task', label: 'Agents', icon: <BotIcon aria-hidden="true" /> },
  { value: 'mcp_task', label: 'Tools', icon: <WrenchIcon aria-hidden="true" /> },
];
/**
 * One list row with its actions built from stable inputs, so a poll that leaves a
 * run unchanged doesn't re-render its row, menu and tooltips.
 */
const RunsPageRow = memo(function RunsPageRow({
  row,
  cancelRequested,
  canStop,
  pending,
  selected,
  onSelect,
  onCancel,
}: {
  row: RunRow;
  cancelRequested: boolean;
  canStop: boolean;
  pending: boolean;
  selected: boolean;
  onSelect: (row: RunRow) => void;
  onCancel: (row: RunRow) => void;
}) {
  return (
    <RunListRow
      actions={
        <RunActions
          onCancel={() => onCancel(row)}
          pending={pending}
          row={{ ...row, cancelRequested }}
        />
      }
      cancelRequested={cancelRequested}
      onSelect={onSelect}
      onTitleKeyDown={(event) => {
        if (event.key !== 'Delete' || !canStop) return;
        event.preventDefault();
        onCancel(row);
      }}
      row={row}
      selected={selected}
    />
  );
}, sameRowProps);
/** Props are equal by identity, except the row: a poll rebuilds it, so compare its data. */
function sameRowProps<P extends { row: RunRow }>(previous: P, next: P): boolean {
  return (Object.keys(next) as (keyof P)[]).every((key) =>
    key === 'row'
      ? replaceEqualDeep(previous.row, next.row) === previous.row
      : Object.is(previous[key], next[key]),
  );
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
  const [searchOpen, setSearchOpen] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  // `/` searches the list from anywhere on the page, including before anything has focus.
  const searchRegion = useMemo<RefObject<Element | null>>(
    () => ({
      get current() {
        const active = document.activeElement;
        return !active || active === document.body ? document.body : pageRef.current;
      },
    }),
    [],
  );
  useShortcut('list-search', () => setSearchOpen(true), { region: searchRegion });
  const [revealCount, setRevealCount] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
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
  // Waiting for you is a subset of active, so it reads the same active-only query.
  const activeOnly =
    category === 'executions' && (stateFilter === 'active' || stateFilter === 'waiting_user');
  const runs = useInfiniteQuery({
    queryKey: queryKeys.key('tasks', settings.endpoint, activeOnly),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ signal, pageParam }) =>
      repository.queryTasks({ cursor: pageParam, activeOnly }, signal),
    getNextPageParam: (page) => page.cursor ?? undefined,
    // A refetch re-reads every loaded page; spacing it by the page count keeps the
    // list's reads per minute the same however far it has been paged.
    refetchInterval: (query) => RUNS_POLL_MS * Math.max(1, query.state.data?.pages.length ?? 1),
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
  const navigationWorkspaceId =
    workspaceIdFromRoute(returnRouteFromState(location.state, settings.endpoint)) ??
    workspaces.data?.[0]?.id ??
    '';
  const selectedHandle = searchParams.get('run') ?? undefined;
  const selectedRow = selectedHandle
    ? (executionRows.find((row) => row.handleId === selectedHandle) ??
      flowRows.find((row) => row.handleId === selectedHandle))
    : undefined;
  const selectRun = useCallback(
    (row: RunRow) => {
      setRevealCount((count) => count + 1);
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.set('run', row.handleId);
          return next;
        },
        { replace: true, state: location.state },
      );
    },
    [location.state, setSearchParams],
  );
  const closeRun = useCallback(
    () =>
      setSearchParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          next.delete('run');
          return next;
        },
        { replace: true, state: location.state },
      ),
    [location.state, setSearchParams],
  );
  const canStopRow = (row: RunRow) =>
    row.cancellable &&
    !row.cancelRequested &&
    !requestedCancellation.has(row.handleId) &&
    !(cancel.isPending && cancel.variables?.handleId === row.handleId);
  const confirmCancel = useCallback(
    (row: RunRow) => setConfirmedAction({ kind: 'cancel', row }),
    [],
  );
  const runActions = (row: RunRow, part?: 'menu') => {
    const cancelRequested = Boolean(row.cancelRequested) || requestedCancellation.has(row.handleId);
    return (
      <RunActions
        onCancel={() => setConfirmedAction({ kind: 'cancel', row })}
        part={part}
        pending={cancel.isPending && cancel.variables?.handleId === row.handleId}
        row={{ ...row, cancelRequested }}
      />
    );
  };
  // Counts are exact only for what is loaded: the active views load active runs.
  const stateCount = (value: string) =>
    rows.filter((row) => matchesRunState(row.state, value)).length;
  const stateOptions = STATE_OPTIONS.map((option) => ({
    ...option,
    count:
      option.value === 'active' || option.value === 'waiting_user'
        ? stateCount(option.value)
        : option.value === 'attention' && !activeOnly
          ? stateCount(option.value)
          : undefined,
  }));
  const currentState =
    stateOptions.find((option) => option.value === stateFilter) ?? stateOptions[0];
  // The chips are the states themselves; no chip chosen shows all of them.
  const stateChips = stateOptions.filter((option) => option.value !== 'all');
  const canIndexMore =
    category === 'flows' &&
    (flowScanLimit < orderedFlowSessions.length || Boolean(flowSessionPages.hasNextPage));
  const indexMore = () => {
    // Read the next page of conversations when the indexed ones run out.
    if (
      flowScanLimit + FLOW_SCAN_BATCH > orderedFlowSessions.length &&
      flowSessionPages.hasNextPage
    ) {
      void flowSessionPages.fetchNextPage();
    }
    setFlowScanLimit((current) => current + FLOW_SCAN_BATCH);
  };
  const footerNote =
    category === 'executions'
      ? runs.hasNextPage
        ? runs.data?.pages[0]?.total == null
          ? 'More available; search covers loaded runs.'
          : `${runs.data.pages[0].total} in total. Search covers loaded runs.`
        : undefined
      : [
          flowsRemaining > 0 ? `${flowsIndexed} of ${flowSessionTotal} sessions indexed` : '',
          flowFailures > 0
            ? `${flowFailures} session${flowFailures === 1 ? '' : 's'} could not be indexed`
            : '',
        ]
          .filter(Boolean)
          .join(', ') || undefined;
  const showFooter =
    Boolean(footerNote) ||
    filteredRows.length > visibleLimit ||
    Boolean(runs.hasNextPage && category === 'executions') ||
    (canIndexMore && filteredRows.length > 0);

  const title = (
    <h1 className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap text-foreground">
      <ActivityIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      Runs
    </h1>
  );

  const bar = (
    <div
      className="@container/runbar flex h-10 min-w-0 shrink-0 items-center gap-2 border-b border-border pr-2.5 pl-3.5 whitespace-nowrap"
      data-slot="runs-list-bar"
    >
      <SegmentedControl
        className="mr-1"
        iconOnly
        label="Run categories"
        onValueChange={setCategory}
        options={[
          { value: 'executions', label: 'Executions', icon: <ActivityIcon aria-hidden="true" /> },
          { value: 'flows', label: 'Flows', icon: <WorkflowIcon aria-hidden="true" /> },
        ]}
        value={category}
      />
      <FilterChips
        className="hidden @[440px]/runbar:flex"
        label="Filter by state"
        none="all"
        onValueChange={setStateFilter}
        options={stateChips}
        value={stateFilter}
      />
      <DropdownMenu modal={false}>
        <NamedTooltip label={`Filter by state: ${currentState.label}`}>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Filter by state: ${currentState.label}${
                currentState.count === undefined ? '' : `, ${currentState.count}`
              }`}
              className={cn(
                'h-6 w-[46px] shrink-0 gap-1 rounded-[12px] border border-border px-0 text-[11.5px] font-medium text-muted-foreground @[440px]/runbar:hidden [&_svg:not([class*=size-])]:size-[13px]',
                stateFilter !== 'all' && 'border-accent-border bg-accent text-accent-foreground',
              )}
              size="sm"
              variant="ghost"
            >
              {currentState.icon}
              {currentState.count === undefined ? null : (
                <span className="tabular-nums">{currentState.count}</span>
              )}
            </Button>
          </DropdownMenuTrigger>
        </NamedTooltip>
        <DropdownMenuContent align="start" className="w-56">
          {stateOptions.map((option) => (
            <DropdownMenuItem key={option.value} onSelect={() => setStateFilter(option.value)}>
              <MenuRow
                checked={option.value === stateFilter}
                icon={option.icon}
                label={option.label}
                value={option.count === undefined ? undefined : String(option.count)}
              />
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {category === 'executions' ? (
        <>
          <FrameDivider className="mx-1 hidden @[480px]/runbar:block" />
          <FilterChips
            className="hidden @[480px]/runbar:flex"
            label="Filter by execution type"
            none="all"
            onValueChange={setSourceFilter}
            options={SOURCE_CHIPS}
            value={sourceFilter}
          />
        </>
      ) : null}
      <span aria-hidden="true" className="flex-1" />
      <span className="hidden shrink-0 text-[11.5px] text-faint tabular-nums @[520px]/runbar:inline">
        {filteredRows.length} {filteredRows.length === 1 ? noun.slice(0, -1) : noun}
      </span>
      {searchOpen || search ? (
        <div className="relative w-44 min-w-24 shrink">
          <SearchIcon
            aria-hidden="true"
            className="absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            aria-label="Search runs"
            autoFocus
            className="h-7 pl-7 text-[12px]"
            onBlur={() => {
              if (!search) setSearchOpen(false);
            }}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return;
              event.stopPropagation();
              setSearch('');
              setSearchOpen(false);
            }}
            placeholder={category === 'flows' ? 'Search flows' : 'Search runs'}
            title={
              category === 'flows'
                ? 'Search flow, workspace, or state'
                : 'Search run, workspace, state, host, or task'
            }
            value={search}
          />
        </div>
      ) : (
        <IconButton
          icon={<SearchIcon aria-hidden="true" />}
          label="Search runs"
          onClick={() => setSearchOpen(true)}
          shortcut="list-search"
          size="sm"
        />
      )}
    </div>
  );

  const list = (
    <div
      className="@container/runs clio-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pt-1 pb-2"
      data-run-list=""
    >
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
        category === 'flows' && !search ? (
          <StateView
            action={
              canIndexMore
                ? {
                    label: flowsIndexing ? 'Indexing…' : 'Index more sessions',
                    onClick: indexMore,
                  }
                : undefined
            }
            detail={footerNote}
            kind="empty"
            title="No flows started in the indexed conversations."
          />
        ) : (
          <StateView kind="empty" title="No runs match the current search and filters." />
        )
      ) : (
        groups.map(({ group, rows: groupRows }) => (
          <section
            aria-labelledby={`runs-group-${group}`}
            className="mb-1 max-w-[840px]"
            key={group}
          >
            <h2
              className="flex h-6 items-center gap-2 px-2 text-[11px] font-semibold text-muted-foreground"
              id={`runs-group-${group}`}
            >
              <span>{RUN_GROUP_LABELS[group]}</span>
              <span className="font-normal tabular-nums">{groupRows.length}</span>
            </h2>
            {groupRows.map((row) => (
              <RunsPageRow
                canStop={Boolean(canStopRow(row))}
                cancelRequested={
                  Boolean(row.cancelRequested) || requestedCancellation.has(row.handleId)
                }
                key={row.handleId}
                onCancel={confirmCancel}
                onSelect={selectRun}
                pending={cancel.isPending && cancel.variables?.handleId === row.handleId}
                row={row}
                selected={row.handleId === selectedHandle}
              />
            ))}
          </section>
        ))
      )}
      {showFooter && !(filteredRows.length === 0 && category === 'flows' && !search) ? (
        <div className="mt-1 flex h-8 max-w-[840px] min-w-0 items-center gap-3 px-2 text-[11.5px] whitespace-nowrap text-muted-foreground">
          {footerNote ? <span className="min-w-0 truncate">{footerNote}</span> : null}
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {filteredRows.length > visibleLimit ? (
              <Button
                onClick={() => setVisibleLimit((current) => current + RUN_ROW_STEP)}
                size="xs"
                variant="ghost"
              >
                Show {Math.min(RUN_ROW_STEP, filteredRows.length - visibleLimit)} more
              </Button>
            ) : null}
            {category === 'executions' && runs.hasNextPage ? (
              <Button
                disabled={runs.isFetchingNextPage}
                onClick={() => void runs.fetchNextPage()}
                size="xs"
                variant="ghost"
              >
                {runs.isFetchingNextPage ? 'Loading…' : 'Load more tasks'}
              </Button>
            ) : null}
            {canIndexMore ? (
              <Button
                disabled={flowsIndexing || flowSessionPages.isFetchingNextPage}
                onClick={indexMore}
                size="xs"
                variant="ghost"
              >
                {flowsIndexing ? 'Indexing…' : 'Index more sessions'}
              </Button>
            ) : null}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <ClioAppShell
      contextBar={title}
      navigation={<RunsNavigation workspaceId={navigationWorkspaceId} />}
      statusStrip={null}
      workbench={
        selectedRow ? (
          <RunTab
            actions={runActions(selectedRow, 'menu')}
            onClose={closeRun}
            onStop={
              selectedRow.cancellable
                ? () => setConfirmedAction({ kind: 'cancel', row: selectedRow })
                : undefined
            }
            row={selectedRow}
            stopping={
              Boolean(selectedRow.cancelRequested) ||
              requestedCancellation.has(selectedRow.handleId) ||
              (cancel.isPending && cancel.variables?.handleId === selectedRow.handleId)
            }
            stateLabel={runStateLabel(
              selectedRow,
              Boolean(selectedRow.cancelRequested) ||
                requestedCancellation.has(selectedRow.handleId),
            )}
          />
        ) : null
      }
      workbenchRevealKey={selectedRow ? `${selectedRow.handleId}:${revealCount}` : undefined}
    >
      <div className="flex h-full min-h-0 flex-col" ref={pageRef}>
        {bar}
        {list}
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
    </ClioAppShell>
  );
}
