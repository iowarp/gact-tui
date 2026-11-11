import type { Artifact, SessionDiff, SubagentRun } from '@clio/core/v3';
import { ListFilterIcon, SearchIcon } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { TaskPageContinuation } from './async-task-list';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { MetaValue } from './primitives/tag';
import { showCompletedWork } from './task-history';
import { useWorkTaskFocus } from './work-task-focus';
import { ActivityKindIcon } from './workbench-activity-icon';
import {
  ACTIVITY_FILTERS,
  ACTIVITY_GROUPS,
  filterActivity,
  type ActivityFilter,
  type ActivityItem,
} from './workbench-activity-model';
import {
  fallbackActivityItems,
  useActivityItems,
  useWorkbenchActivitySource,
  type WorkbenchActivitySource,
} from './workbench-activity-source';
import { activityTab } from './workbench-activity-tab';
import { tabForOpenRequest } from './workbench-open-request';
import type { WorkbenchTab } from './workbench-shared';
import { workTab } from './workbench-tab-storage';

export interface WorkbenchActivityListProps {
  sessionId: string;
  workspaceId: string;
  tabs: readonly WorkbenchTab[];
  activeTabId: string;
  subagents: readonly SubagentRun[];
  finishedWorkHidden: boolean;
  /** Draws the column header with the list's own controls beside the title. */
  renderHeader: (actions: ReactNode) => ReactNode;
  onOpenTab: (tab: WorkbenchTab) => void;
  onOpenFile: (path: string) => void;
  onOpenArtifact: (artifact: Artifact) => void;
  onOpenSubagent: (subagent: SubagentRun) => void;
}

/** Above this many rows only the visible ones mount. */
const WINDOW_ABOVE = 200;
const ROW_HEIGHT = 28;

type Entry =
  | { type: 'group'; id: string; label: string }
  | { type: 'item'; id: string; item: ActivityItem };

/**
 * The Activity list: what is running now, what this turn did, and what came
 * before. A row opens its details as a tab.
 */
export const WorkbenchActivityList = memo(function WorkbenchActivityList(
  props: WorkbenchActivityListProps,
) {
  const source = useWorkbenchActivitySource();
  return source && source.sessionId === props.sessionId ? (
    <ProvidedActivity {...props} source={source} />
  ) : (
    <BareActivity {...props} />
  );
});

function ProvidedActivity({
  source,
  ...props
}: WorkbenchActivityListProps & { source: WorkbenchActivitySource }) {
  const items = useActivityItems(source);
  return <ActivityColumn {...props} items={items} source={source} />;
}

function BareActivity(props: WorkbenchActivityListProps) {
  const items = useMemo(() => fallbackActivityItems(props.subagents), [props.subagents]);
  return <ActivityColumn {...props} items={items} />;
}

function diffTab(diff: SessionDiff, sessionId: string, workspaceId: string) {
  return tabForOpenRequest({ kind: 'diff', diff }, sessionId, workspaceId);
}

/** The tab a row opens: files, changes, child agents, outputs and work open their own. */
function tabIdFor(item: ActivityItem, sessionId: string, workspaceId: string): string {
  if (item.diff) return diffTab(item.diff, sessionId, workspaceId).id;
  if (item.kind === 'work') return workTab.id;
  if (item.subagent?.child_session_id) return `subagent:${item.subagent.child_session_id}`;
  if (item.artifact)
    return tabForOpenRequest({ kind: 'artifact', artifact: item.artifact }, sessionId, workspaceId)
      .id;
  return activityTab(item, sessionId, workspaceId).id;
}

function ActivityColumn({
  items,
  source,
  sessionId,
  workspaceId,
  tabs,
  activeTabId,
  finishedWorkHidden,
  renderHeader,
  onOpenTab,
  onOpenFile,
  onOpenArtifact,
  onOpenSubagent,
}: WorkbenchActivityListProps & {
  items: readonly ActivityItem[];
  source?: WorkbenchActivitySource;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [hidden, setHidden] = useState<ReadonlySet<ActivityFilter>>(() => new Set());
  const searchRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => filterActivity(items, query, hidden), [items, query, hidden]);
  const entries = useMemo(() => {
    const rows: Entry[] = [];
    for (const group of ACTIVITY_GROUPS) {
      const members = shown.filter((item) => item.group === group.id);
      if (!members.length) continue;
      rows.push({ type: 'group', id: `group:${group.id}`, label: group.label });
      for (const item of members) rows.push({ type: 'item', id: item.id, item });
    }
    return rows;
  }, [shown]);

  const active = tabs.find((tab) => tab.id === activeTabId);
  const activeFile =
    active?.kind === 'workspace-file' && active.workspaceId === workspaceId
      ? active.path
      : undefined;
  const open = useCallback(
    (item: ActivityItem) => {
      if (item.diff) onOpenTab(diffTab(item.diff, sessionId, workspaceId));
      else if (item.kind === 'file' && item.path) onOpenFile(item.path);
      else if (item.kind === 'work') onOpenTab(workTab);
      else if (item.subagent?.child_session_id) onOpenSubagent(item.subagent);
      else if (item.artifact) onOpenArtifact(item.artifact);
      else onOpenTab(activityTab(item, sessionId, workspaceId));
    },
    [onOpenArtifact, onOpenFile, onOpenSubagent, onOpenTab, sessionId, workspaceId],
  );

  // A link asked to show a task ("Show in Work"): open that task's details.
  const focusHandle = useWorkTaskFocus((state) => state.handle);
  useEffect(() => {
    if (!focusHandle) return;
    const target = items.find(
      (item) =>
        item.process &&
        [item.process.handle, item.process.handle_id, item.process.id].includes(focusHandle),
    );
    if (!target) return;
    useWorkTaskFocus.getState().clear(focusHandle);
    open(target);
  }, [focusHandle, items, open]);

  const filtered = query.trim() !== '' || hidden.size > 0;
  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };
  const history = source?.workPages?.history;
  const header = renderHeader(
    <>
      <IconButton
        aria-pressed={searching}
        icon={<SearchIcon />}
        label={searching ? 'Close search' : 'Search activity'}
        onClick={() => (searching ? closeSearch() : setSearching(true))}
        size="sm"
        tooltipSide="bottom"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-pressed={hidden.size > 0}
            icon={<ListFilterIcon />}
            label={hidden.size ? `Filter activity, ${hidden.size} hidden` : 'Filter activity'}
            size="sm"
            tooltipSide="bottom"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>Show</DropdownMenuLabel>
          {ACTIVITY_FILTERS.map((filter) => (
            <DropdownMenuCheckboxItem
              checked={!hidden.has(filter.id)}
              key={filter.id}
              onCheckedChange={(checked) =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (checked) next.delete(filter.id);
                  else next.add(filter.id);
                  return next;
                })
              }
              onSelect={(event) => event.preventDefault()}
            >
              {filter.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>,
  );

  let body: ReactNode;
  if (!entries.length)
    body = filtered ? (
      <StateView
        action={{
          label: 'Clear filters',
          onClick: () => {
            closeSearch();
            setHidden(new Set());
          },
        }}
        className="p-4"
        detail="Clear the search or show more kinds."
        kind="empty"
        size="panel"
        title="No activity matches"
      />
    ) : (
      <StateView
        className="p-4"
        detail={sessionId ? 'Tool calls, files, tasks and questions appear here.' : undefined}
        kind="empty"
        size="panel"
        title={sessionId ? 'Nothing has run yet' : 'Activity starts with the first message'}
      />
    );
  else
    body = (
      <ActivityRows
        activeFile={activeFile}
        activeTabId={activeTabId}
        entries={entries}
        onOpen={open}
        sessionId={sessionId}
        workspaceId={workspaceId}
      />
    );

  return (
    <>
      {header}
      {searching ? (
        <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
          <Input
            aria-label="Search activity"
            autoFocus
            className="h-7 text-xs"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
              }
            }}
            placeholder="Search activity"
            ref={searchRef}
            value={query}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-1" data-slot="activity-scroll">
        {body}
        {history && showCompletedWork(history) ? (
          <div className="grid gap-1 border-t border-border px-1 pt-1">
            <Button
              aria-expanded={history.visible}
              className="justify-start"
              onClick={history.toggle}
              size="sm"
              variant="ghost"
            >
              {history.visible ? 'Hide finished work' : 'Show finished work'}
            </Button>
            {history.visible ? (
              <>
                {history.error ? (
                  <p className="px-2 text-[12px] text-destructive" role="alert">
                    {history.error}
                  </p>
                ) : null}
                <TaskPageContinuation
                  label="Load more finished work"
                  pagination={{
                    hasMore: history.hasMore,
                    pending: history.pending,
                    loadMore: history.loadMore,
                  }}
                />
              </>
            ) : null}
          </div>
        ) : null}
        {!source && finishedWorkHidden ? (
          <p className="flex h-7 items-center truncate px-2 text-[12px] text-muted-foreground">
            Finished child agents are not loaded
          </p>
        ) : null}
        <TaskPageContinuation label="Load more work" pagination={source?.workPages} />
      </div>
    </>
  );
}

/** Enter and Space open a row, like a click. */
function activateOnKey(open: () => void) {
  return (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  };
}

function ActivityRows({
  entries,
  activeTabId,
  activeFile,
  sessionId,
  workspaceId,
  onOpen,
}: {
  entries: readonly Entry[];
  activeTabId: string;
  activeFile?: string;
  sessionId: string;
  workspaceId: string;
  onOpen: (item: ActivityItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const windowed = entries.length > WINDOW_ABOVE;
  const [scrollMargin, setScrollMargin] = useState(0);
  const scrollElement = useCallback(
    () =>
      listRef.current?.closest<HTMLElement>('[data-slot="activity-scroll"]') ??
      listRef.current?.parentElement ??
      null,
    [],
  );
  useLayoutEffect(() => {
    if (!windowed) return;
    const list = listRef.current;
    const scroller = scrollElement();
    if (!list || !scroller) return;
    setScrollMargin(
      list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop,
    );
  }, [scrollElement, windowed]);
  // oxlint-disable-next-line react/incompatible-library -- TanStack owns these functions.
  const virtualizer = useVirtualizer({
    count: entries.length,
    enabled: windowed,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => entries[index]!.id,
    getScrollElement: scrollElement,
    overscan: 12,
    scrollMargin,
  });
  const selected = (item: ActivityItem) =>
    item.kind === 'file' && item.path
      ? activeFile === item.path
      : activeTabId === tabIdFor(item, sessionId, workspaceId);
  const render = (entry: Entry) =>
    entry.type === 'group' ? (
      <p
        className="flex h-7 items-end px-2 pb-1 text-[11px] font-semibold text-muted-foreground"
        role="listitem"
      >
        {entry.label}
      </p>
    ) : (
      <ActivityRow item={entry.item} onOpen={onOpen} selected={selected(entry.item)} />
    );
  if (!windowed)
    return (
      <div aria-label="Activity" ref={listRef} role="list">
        {entries.map((entry) => (
          <div key={entry.id}>{render(entry)}</div>
        ))}
      </div>
    );
  return (
    <div
      aria-label="Activity"
      className="relative"
      ref={listRef}
      role="list"
      style={{ height: virtualizer.getTotalSize() }}
    >
      {virtualizer.getVirtualItems().map((virtual) => (
        <div
          className="absolute inset-x-0"
          key={virtual.key}
          style={{ top: virtual.start - scrollMargin, height: virtual.size }}
        >
          {render(entries[virtual.index]!)}
        </div>
      ))}
    </div>
  );
}

const ActivityRow = memo(function ActivityRow({
  item,
  selected,
  onOpen,
}: {
  item: ActivityItem;
  selected: boolean;
  onOpen: (item: ActivityItem) => void;
}) {
  const open = () => onOpen(item);
  return (
    <div role="listitem" title={`${item.name}, ${item.status}`}>
      <ListRow
        aria-current={selected || undefined}
        aria-label={`${item.name}, ${item.status}`}
        className="cursor-pointer text-[12.5px]"
        columns={<MetaValue width={64}>{item.trailing}</MetaValue>}
        data-kind={item.kind}
        icon={
          item.running ? (
            <StatusIndicator display="column" label="Running" tone="running" />
          ) : (
            <ActivityKindIcon kind={item.kind} work={item.work} />
          )
        }
        onClick={open}
        onKeyDown={activateOnKey(open)}
        role="button"
        selected={selected}
        tabIndex={0}
        title={item.name}
      />
    </div>
  );
});
