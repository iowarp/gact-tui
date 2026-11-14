import type { Message, ToolInvocation } from '@clio/core/v3';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ListFilterIcon, PanelRightOpenIcon, SearchIcon } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { activateActivityItem } from './activity-navigation';
import {
  CAUSAL_ATTENTION_STATES,
  causalAttentionTone,
  causalLaneId,
  causalLanes,
  causalRows,
  formatGraphTime,
  type CausalLane,
} from './activity-causal';
import { ActivityGlyph, type ObservabilityActivityItem } from './observability-activity';
import { IconButton } from './primitives/icon-button';
import { ListRow } from './primitives/list-row';
import { StateView } from './primitives/state-view';
import { MetaValue } from './primitives/tag';
import { backgroundTaskLink } from './script-run';
import { clioStatusLabel } from './status';
import { useWorkTaskFocus } from './work-task-focus';
import { liveChipWord } from './workbench-activity-model';
import { t, ph } from '@lingui/core/macro';

type TimelineKind = 'tools' | 'agents' | 'questions' | 'runs' | 'outputs';

const TIMELINE_KINDS: readonly { id: TimelineKind; label: string }[] = [
  { id: 'tools', label: t`Tool calls` },
  { id: 'agents', label: t`Child agents and tasks` },
  { id: 'questions', label: t`Questions` },
  { id: 'runs', label: t`Runs` },
  { id: 'outputs', label: t`Outputs and sources` },
];

type TimelineGroup = 'now' | 'turn' | 'earlier';

const TIMELINE_GROUPS: readonly { id: TimelineGroup; label: string }[] = [
  { id: 'now', label: t`Now` },
  { id: 'turn', label: t`This turn` },
  { id: 'earlier', label: t`Earlier` },
];

const TIMELINE_LIVE_STATES: ReadonlySet<string> = new Set([
  'queued',
  'running',
  'pending',
  'waiting_permission',
  'waiting_user',
]);

/** Above this many rows only the visible ones mount. */
const TIMELINE_WINDOW_ABOVE = 200;
const TIMELINE_ROW_HEIGHT = 28;

type TimelineEntry =
  | { type: 'group'; id: string; label: string }
  | { type: 'item'; id: string; item: ObservabilityActivityItem };

function timelineKind(item: ObservabilityActivityItem): TimelineKind {
  if (item.kind === 'tool') return 'tools';
  if (item.kind === 'process') return 'agents';
  if (item.kind === 'interaction') return 'questions';
  if (item.kind === 'run') return 'runs';
  return 'outputs';
}

function timelineLive(item: ObservabilityActivityItem): boolean {
  return TIMELINE_LIVE_STATES.has(item.state) && item.lifecycle !== 'close';
}

function timelineGroup(item: ObservabilityActivityItem, turnStartedAt?: number): TimelineGroup {
  if (timelineLive(item)) return 'now';
  const at = item.at ? Date.parse(item.at) : Number.NaN;
  return turnStartedAt === undefined || Number.isNaN(at) || at >= turnStartedAt
    ? 'turn'
    : 'earlier';
}

/**
 * The workbench's Activity: the same causal record as the graph, as one list of
 * 28px rows, newest first and grouped Now, This turn and Earlier. Each row keeps
 * its agent strand in a narrow gutter, so delegation still reads at a glance; the
 * header's search and filter (agent and kind) replace the graph's chips and zoom.
 */
export function ClioActivityTimelineList({
  items,
  messages,
  tools,
  turnStartedAt,
  renderHeader,
  notice,
  footer,
}: {
  items: readonly ObservabilityActivityItem[];
  messages: readonly Message[];
  /** The session's tool calls, to find the script call that started a linked task. */
  tools?: readonly ToolInvocation[];
  /** When the current run started: later rows are This turn, older ones Earlier. */
  turnStartedAt?: string;
  renderHeader: (actions: ReactNode) => ReactNode;
  /** A pending or failed read, above the rows. */
  notice?: ReactNode;
  /** The record source and write folders, under the rows. */
  footer?: ReactNode;
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<TimelineKind>>(() => new Set());
  const rows = useMemo(() => causalRows(items), [items]);
  const lanes = useMemo(() => causalLanes(rows), [rows]);
  const laneById = useMemo(() => new Map(lanes.map((lane) => [lane.id, lane])), [lanes]);
  const messageIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);
  const agent = agentFilter && laneById.has(agentFilter) ? agentFilter : null;
  const turnStart = turnStartedAt ? Date.parse(turnStartedAt) : Number.NaN;
  const entries = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const groups: Record<TimelineGroup, ObservabilityActivityItem[]> = {
      now: [],
      turn: [],
      earlier: [],
    };
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      const row = rows[index]!;
      const laneId = causalLaneId(row);
      if (agent && laneId !== agent) continue;
      if (hidden.has(timelineKind(row))) continue;
      if (
        needle &&
        !`${row.label} ${row.detail ?? ''} ${laneById.get(laneId)?.label ?? ''}`
          .toLowerCase()
          .includes(needle)
      )
        continue;
      const item =
        row.transcriptMessageId || !row.groupId || !messageIds.has(row.groupId)
          ? row
          : { ...row, transcriptMessageId: row.groupId };
      groups[timelineGroup(item, Number.isNaN(turnStart) ? undefined : turnStart)].push(item);
    }
    const out: TimelineEntry[] = [];
    for (const group of TIMELINE_GROUPS) {
      const members = groups[group.id];
      if (!members.length) continue;
      out.push({ type: 'group', id: `group:${group.id}`, label: group.label });
      for (const item of members) out.push({ type: 'item', id: `${item.kind}:${item.id}`, item });
    }
    return out;
  }, [agent, hidden, laneById, messageIds, query, rows, turnStart]);

  // A link asked to show a task ("Show the task in Work"): select its row, or the
  // script call that started it once the task has left the record, then clear the ask.
  const focusHandle = useWorkTaskFocus((state) => state.handle);
  const [selectedId, setSelectedId] = useState<string>();
  const [focusedHandle, setFocusedHandle] = useState<string>();
  const focusTarget = useMemo(() => {
    if (!focusHandle) return undefined;
    const launcher = tools?.find((tool) =>
      tool.presentation?.blocks.some(
        (block) => backgroundTaskLink(block) && block.uri === focusHandle,
      ),
    );
    const target =
      rows.find(
        (row) =>
          row.kind === 'process' &&
          (row.taskId === focusHandle || row.id === focusHandle) &&
          row.lifecycle !== 'close',
      ) ?? (launcher ? rows.find((row) => row.kind === 'tool' && row.id === launcher.id) : undefined);
    return target ? `${target.kind}:${target.id}` : undefined;
  }, [focusHandle, rows, tools]);
  if (focusHandle !== focusedHandle && (!focusHandle || focusTarget)) {
    setFocusedHandle(focusHandle);
    if (focusHandle) {
      setSearching(false);
      setQuery('');
      setHidden(new Set());
      setAgentFilter(null);
      setSelectedId(focusTarget);
    }
  }
  useEffect(() => {
    if (focusHandle && focusTarget) useWorkTaskFocus.getState().clear(focusHandle);
  }, [focusHandle, focusTarget]);

  const filtered = query.trim() !== '' || hidden.size > 0 || agent !== null;
  const closeSearch = () => {
    setSearching(false);
    setQuery('');
  };
  const filterCount = hidden.size + (agent ? 1 : 0);
  const header = renderHeader(
    <>
      <IconButton
        aria-pressed={searching}
        icon={<SearchIcon />}
        label={searching ? t`Close search` : t`Search activity`}
        onClick={() => (searching ? closeSearch() : setSearching(true))}
        size="sm"
        tooltipSide="bottom"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton
            aria-pressed={filterCount > 0}
            icon={<ListFilterIcon />}
            label={filterCount ? t`Filter activity, ${filterCount} on` : t`Filter activity`}
            size="sm"
            tooltipSide="bottom"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {lanes.length > 1 ? (
            <>
              <DropdownMenuLabel>{t`Agent`}</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                onValueChange={(value) => setAgentFilter(value === 'all' ? null : value)}
                value={agent ?? 'all'}
              >
                <DropdownMenuRadioItem value="all">{t`All agents`}</DropdownMenuRadioItem>
                {lanes.map((lane) => (
                  <DropdownMenuRadioItem key={lane.id} value={lane.id}>
                    <span
                      aria-hidden="true"
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: lane.color }}
                    />
                    <span className="truncate">{lane.label}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuLabel>{t`Show`}</DropdownMenuLabel>
          {TIMELINE_KINDS.map((kind) => (
            <DropdownMenuCheckboxItem
              checked={!hidden.has(kind.id)}
              key={kind.id}
              onCheckedChange={(checked) =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (checked) next.delete(kind.id);
                  else next.add(kind.id);
                  return next;
                })
              }
              onSelect={(event) => event.preventDefault()}
            >
              {kind.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>,
  );

  // Strands sit 12px apart; many agents pack closer so the gutter stays under ~86px.
  const laneSpacing = lanes.length <= 6 ? 12 : Math.max(5, Math.floor(72 / lanes.length));
  const gutterWidth = 14 + (lanes.length - 1) * laneSpacing;
  const hasActions = rows.some((row) => row.onOpen && row.kind !== 'process');
  const body = !rows.length ? (
    <StateView
      className="p-4"
      detail={t`Tool calls, child agents and questions appear here.`}
      kind="empty"
      size="panel"
      title={t`Nothing has run yet`}
    />
  ) : !entries.length ? (
    <StateView
      action={
        filtered
          ? {
              label: t`Clear filters`,
              onClick: () => {
                closeSearch();
                setHidden(new Set());
                setAgentFilter(null);
              },
            }
          : undefined
      }
      className="p-4"
      detail={filtered ? t`Clear the search or show more kinds.` : undefined}
      kind="empty"
      size="panel"
      title={t`No activity matches`}
    />
  ) : (
    <TimelineRows
      entries={entries}
      gutterWidth={gutterWidth}
      hasActions={hasActions}
      laneSpacing={laneSpacing}
      lanes={lanes}
      onActivate={() => setSelectedId(undefined)}
      selectedId={selectedId}
    />
  );
  return (
    <>
      {header}
      {searching ? (
        <div className="flex h-9 shrink-0 items-center border-b border-border px-1.5">
          <Input
            aria-label={t`Search activity`}
            autoFocus
            className="h-7 text-xs"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                closeSearch();
              }
            }}
            placeholder={t`Search activity`}
            value={query}
          />
        </div>
      ) : null}
      {notice}
      <div className="min-h-0 flex-1 overflow-y-auto p-1" data-slot="activity-scroll">
        {body}
      </div>
      {footer}
    </>
  );
}

function TimelineRows({
  entries,
  lanes,
  laneSpacing,
  gutterWidth,
  hasActions,
  selectedId,
  onActivate,
}: {
  entries: readonly TimelineEntry[];
  lanes: readonly CausalLane[];
  laneSpacing: number;
  gutterWidth: number;
  hasActions: boolean;
  /** The row a "show the task" link selected; it scrolls into view once. */
  selectedId?: string;
  onActivate: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const windowed = entries.length > TIMELINE_WINDOW_ABOVE;
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
    estimateSize: () => TIMELINE_ROW_HEIGHT,
    getItemKey: (index) => entries[index]!.id,
    getScrollElement: scrollElement,
    overscan: 12,
    scrollMargin,
  });
  const selectedIndex = selectedId
    ? entries.findIndex((entry) => entry.id === selectedId)
    : -1;
  useLayoutEffect(() => {
    if (selectedIndex < 0) return;
    if (windowed) virtualizer.scrollToIndex(selectedIndex, { align: 'center' });
    const reveal = () => {
      const row = listRef.current?.querySelector<HTMLElement>('[data-timeline-selected]');
      if (!row) return;
      if (!windowed) row.scrollIntoView({ block: 'nearest' });
      row.querySelector<HTMLElement>('[tabindex="0"]')?.focus({ preventScroll: true });
    };
    if (windowed) requestAnimationFrame(reveal);
    else reveal();
    // Only a new selection scrolls; later updates leave the reader where they are.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  const render = (entry: TimelineEntry) =>
    entry.type === 'group' ? (
      <p
        className="flex h-7 items-end px-2 pb-1 text-caption font-semibold text-muted-foreground"
        role="listitem"
      >
        {entry.label}
      </p>
    ) : (
      <TimelineRow
        gutterWidth={gutterWidth}
        hasActions={hasActions}
        item={entry.item}
        laneSpacing={laneSpacing}
        lanes={lanes}
        onActivate={onActivate}
        selected={entry.id === selectedId}
      />
    );
  if (!windowed)
    return (
      <div aria-label={t`Activity timeline`} ref={listRef} role="list">
        {entries.map((entry) => (
          <div key={entry.id}>{render(entry)}</div>
        ))}
      </div>
    );
  return (
    <div
      aria-label={t`Activity timeline`}
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

const TimelineRow = memo(function TimelineRow({
  item,
  lanes,
  laneSpacing,
  gutterWidth,
  hasActions,
  selected,
  onActivate,
}: {
  item: ObservabilityActivityItem;
  lanes: readonly CausalLane[];
  laneSpacing: number;
  gutterWidth: number;
  hasActions: boolean;
  selected: boolean;
  onActivate: () => void;
}) {
  const lane = lanes.find((candidate) => candidate.id === causalLaneId(item)) ?? lanes[0]!;
  const parent = lanes.find((candidate) => candidate.id === item.parentSessionId) ?? lanes[0]!;
  const target = Boolean(item.transcriptMessageId || item.onActivate || item.onOpen);
  const attention = CAUSAL_ATTENTION_STATES.has(item.state);
  const live = timelineLive(item);
  const status = clioStatusLabel(item.state);
  const when = live && !attention ? liveChipWord(item.state) : (item.fact ?? '');
  const hover = [
    item.label,
    lane.label,
    status,
    item.detail,
    item.at && item.timing !== 'turn' ? formatGraphTime(item.at) : undefined,
  ]
    .filter(Boolean)
    .join('. ');
  const activate = (event: { shiftKey: boolean }) => {
    onActivate();
    activateActivityItem(item, event);
  };
  return (
    <div data-timeline-selected={selected || undefined} role="listitem" title={hover}>
      <ListRow
        actions={
          hasActions ? (
            item.onOpen && item.kind !== 'process' ? (
              <IconButton
                icon={<PanelRightOpenIcon />}
                label={t`Open in canvas`}
                onClick={(event) => {
                  event.stopPropagation();
                  item.onOpen?.('canvas');
                }}
                size="sm"
              />
            ) : null
          ) : undefined
        }
        actionsWidth={26}
        aria-current={selected || undefined}
        aria-label={target ? t`Open ${ph({ label: item.label })}, ${status}` : undefined}
        className={cn('text-menu', target ? 'cursor-pointer' : 'hover:bg-transparent')}
        columns={
          <>
            {attention ? (
              <span
                className={cn('shrink-0 text-caption font-medium', causalAttentionTone(item.state))}
              >
                {status}
              </span>
            ) : null}
            <MetaValue width={52}>{when}</MetaValue>
          </>
        }
        data-lifecycle={item.lifecycle}
        icon={<ActivityGlyph className="size-3.5" item={item} />}
        leading={
          <TimelineStrands
            item={item}
            lane={lane}
            laneSpacing={laneSpacing}
            lanes={lanes}
            live={live}
            parent={parent}
            width={gutterWidth}
          />
        }
        onClick={target ? activate : undefined}
        onKeyDown={
          target
            ? (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                activate(event);
              }
            : undefined
        }
        role={target ? 'button' : undefined}
        selected={selected}
        tabIndex={target ? 0 : undefined}
        title={item.label}
      />
    </div>
  );
});

/** The row's slice of every agent strand, its node, and a branch or join curve. */
function TimelineStrands({
  item,
  lane,
  parent,
  lanes,
  laneSpacing,
  live,
  width,
}: {
  item: ObservabilityActivityItem;
  lane: CausalLane;
  parent: CausalLane;
  lanes: readonly CausalLane[];
  laneSpacing: number;
  live: boolean;
  width: number;
}) {
  const x = 7 + lane.index * laneSpacing;
  const parentX = 7 + parent.index * laneSpacing;
  // Newest first: a branch leaves its parent below it, a join returns above it.
  return (
    <span aria-hidden="true" className="relative shrink-0 self-stretch" style={{ width }}>
      <svg
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        viewBox={`0 0 ${width} 28`}
      >
        {lanes.map((candidate) => {
          const lineX = 7 + candidate.index * laneSpacing;
          return (
            <line
              key={candidate.id}
              style={{ stroke: candidate.color }}
              strokeOpacity="0.3"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
              x1={lineX}
              x2={lineX}
              y1="0"
              y2="28"
            />
          );
        })}
        {item.lifecycle === 'open' && lane.id !== parent.id ? (
          <path
            d={`M ${parentX} 28 C ${parentX} 19, ${x} 19, ${x} 14`}
            fill="none"
            style={{ stroke: lane.color }}
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {item.lifecycle === 'close' && lane.id !== parent.id ? (
          <path
            d={`M ${x} 14 C ${x} 9, ${parentX} 9, ${parentX} 0`}
            fill="none"
            style={{ stroke: lane.color }}
            strokeWidth="1.75"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      <span
        className={cn(
          'absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 border-[1.5px] bg-background',
          item.lifecycle === 'open'
            ? 'rotate-45 rounded-[1px]'
            : item.kind === 'tool'
              ? 'rounded-[2px]'
              : 'rounded-full',
        )}
        style={{ borderColor: lane.color, left: x, backgroundColor: live ? lane.color : undefined }}
      />
    </span>
  );
}
