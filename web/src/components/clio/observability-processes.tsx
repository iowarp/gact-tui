import type {
  AsyncProcess,
  Message,
  Run,
  RunState,
  SubagentRun,
  ToolInvocation,
  ToolState,
} from '@clio/core/v3';
import { scaleTime } from 'd3-scale';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import {
  BotIcon,
  BoxesIcon,
  Clock3Icon,
  MinusIcon,
  PlusIcon,
  ScanIcon,
  ServerCogIcon,
  WrenchIcon,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { SubagentOpenTarget } from './subagent-card';
import { humanizeProtocolValue } from './presentation-labels';
import { ClioStatus } from './status';
import { getToolPresentation } from './tool-presentation';

const LABEL_COLUMN_PX = 148;
const FALLBACK_PLOT_PX = 420;
const MAX_ZOOM = 200;
const BRANCH_COLORS = ['#22d3ee', '#60a5fa', '#a78bfa', '#34d399', '#fb7185', '#facc15'];

interface ClioProcessLanesProps {
  messages?: readonly Message[];
  processes: readonly AsyncProcess[];
  runs?: readonly Run[];
  subagents?: readonly SubagentRun[];
  tools?: readonly ToolInvocation[];
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

/** Zoomable execution Gantt adapted from the proven pre-rebuild observability surface. */
export function ClioProcessLanes({
  messages = [],
  processes,
  runs = [],
  subagents = [],
  tools = [],
  onOpenSubagent,
}: ClioProcessLanesProps) {
  const spans = useMemo(
    () => executionSpans({ messages, processes, runs, tools }),
    [messages, processes, runs, tools],
  );
  const branches = useMemo(() => branchPalette(spans), [spans]);
  const lanes = useMemo(() => executionLanes(spans, branches), [branches, spans]);
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(LABEL_COLUMN_PX + FALLBACK_PLOT_PX);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [now, setNow] = useState(() => Date.now());

  const hasRunning = spans.some((span) => span.end === null);
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width > LABEL_COLUMN_PX) setPlotWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const extent = useMemo(() => fullExtent(spans, now), [now, spans]);
  const labelWidth = plotWidth < 460 ? 116 : LABEL_COLUMN_PX;
  const laneWidth = Math.max(1, plotWidth - labelWidth);
  const baseScale = useMemo(
    () =>
      scaleTime()
        .domain([extent.start, extent.end])
        .range([labelWidth, labelWidth + laneWidth]),
    [extent.end, extent.start, labelWidth, laneWidth],
  );
  const visibleScale = useMemo(() => transform.rescaleX(baseScale), [baseScale, transform]);
  const windowRange = useMemo(
    () => ({
      start: visibleScale.invert(labelWidth).getTime(),
      end: visibleScale.invert(labelWidth + laneWidth).getTime(),
    }),
    [labelWidth, laneWidth, visibleScale],
  );
  const zoom = useMemo(
    () =>
      d3Zoom<HTMLDivElement, unknown>()
        .scaleExtent([1, MAX_ZOOM])
        .extent((): [[number, number], [number, number]] => [
          [labelWidth, 0],
          [labelWidth + laneWidth, 1],
        ])
        .translateExtent([
          [labelWidth, Number.NEGATIVE_INFINITY],
          [labelWidth + laneWidth, Number.POSITIVE_INFINITY],
        ])
        .filter((event) => {
          const target = event.target;
          if (target instanceof Element && target.closest('[data-execution-action]')) return false;
          return (!event.ctrlKey || event.type === 'wheel') && !event.button;
        })
        .clickDistance(4),
    [labelWidth, laneWidth],
  );

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const selection = select(node);
    zoom.on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      setTransform(event.transform);
    });
    selection.call(zoom);
    selection.on('dblclick.zoom', null);
    return () => {
      selection.on('.zoom', null);
    };
  }, [zoom]);

  const applyZoom = useCallback(
    (factor: number) => {
      if (plotRef.current) select(plotRef.current).call(zoom.scaleBy, factor);
    },
    [zoom],
  );
  const fit = useCallback(() => {
    if (!plotRef.current) {
      setTransform(zoomIdentity);
      return;
    }
    select(plotRef.current).call(zoom.transform, zoomIdentity);
  }, [zoom]);
  const ticks = useMemo(() => {
    const capacity = laneWidth < 520 ? 2 : Math.min(5, Math.max(3, Math.floor(laneWidth / 110)));
    const candidates = visibleScale.ticks(capacity);
    const step = Math.max(1, Math.ceil(candidates.length / capacity));
    return candidates
      .filter((_, index) => index % step === 0)
      .map((at) => ({ at: at.getTime(), left: percent(at.getTime(), windowRange) }))
      .filter((tick) => tick.left >= 0 && tick.left <= 100);
  }, [laneWidth, visibleScale, windowRange]);

  if (!lanes.length) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
        No execution timing was recorded for this session.
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={240}>
      <Frame spacing="sm" variant="ghost">
        <FrameHeader className="flex-row items-center justify-between gap-2">
          <FrameTitle>Execution</FrameTitle>
          <div className="flex shrink-0 items-center gap-1" role="group" aria-label="Timeline zoom">
            <TimelineControl
              icon={<MinusIcon />}
              label="Zoom out"
              onClick={() => applyZoom(1 / 1.6)}
            />
            <TimelineControl icon={<PlusIcon />} label="Zoom in" onClick={() => applyZoom(1.6)} />
            <TimelineControl icon={<ScanIcon />} label="Fit full timeline" onClick={fit} />
          </div>
        </FrameHeader>
        <FramePanel className="space-y-2">
          <div className="flex items-center text-[10px] text-muted-foreground">
            <span className="font-mono tabular-nums">{formatWindow(windowRange)}</span>
          </div>
          <div
            aria-label="Observed execution spans"
            className="touch-none select-none overflow-hidden rounded-lg border bg-background/40"
            ref={plotRef}
            role="region"
          >
            <div
              className="grid border-b bg-muted/30"
              style={{ gridTemplateColumns: `${labelWidth}px minmax(8rem, 1fr)` }}
            >
              <div className="border-r px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Agent and work
              </div>
              <div className="relative h-8 overflow-hidden">
                {ticks.map((tick) => (
                  <time
                    className="absolute inset-y-0 border-l border-border/70 pl-1 pt-2 font-mono text-[9px] text-muted-foreground"
                    dateTime={new Date(tick.at).toISOString()}
                    key={tick.at}
                    style={{ left: `${tick.left}%` }}
                  >
                    {formatAxisTime(tick.at, windowRange)}
                  </time>
                ))}
              </div>
            </div>
            {lanes.map((lane) => (
              <ProcessLaneRow
                key={lane.id}
                lane={lane}
                labelWidth={labelWidth}
                now={now}
                onOpenSubagent={onOpenSubagent}
                subagents={subagents}
                windowRange={windowRange}
              />
            ))}
          </div>
        </FramePanel>
      </Frame>
    </TooltipProvider>
  );
}

function TimelineControl({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button aria-label={label} onClick={onClick} size="icon-sm" type="button" variant="ghost">
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ProcessLaneRow({
  lane,
  labelWidth,
  now,
  onOpenSubagent,
  subagents,
  windowRange,
}: {
  lane: ProcessLane;
  labelWidth: number;
  now: number;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: readonly SubagentRun[];
  windowRange: TimeRange;
}) {
  return (
    <div
      className="grid min-h-11 border-b last:border-b-0"
      style={{ gridTemplateColumns: `${labelWidth}px minmax(8rem, 1fr)` }}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-r px-2 py-1.5">
        {lane.kind === 'main' ? (
          <BotIcon aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
        ) : lane.kind === 'agent' ? (
          <BoxesIcon
            aria-hidden="true"
            className="size-3.5 shrink-0"
            style={{ color: lane.color }}
          />
        ) : lane.kind === 'tool' ? (
          <WrenchIcon aria-hidden="true" className="size-3.5 shrink-0 text-info" />
        ) : (
          <ServerCogIcon aria-hidden="true" className="size-3.5 shrink-0 text-action" />
        )}
        <span
          className={cn('min-w-0 truncate text-xs font-medium', lane.depth > 0 && 'pl-2')}
          title={lane.label}
        >
          {lane.label}
        </span>
      </div>
      <div className="relative min-h-11 overflow-hidden bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] bg-[size:25%_100%]">
        {lane.spans.map((span) => {
          const geometry = barGeometry(span, windowRange, now);
          if (!geometry) return null;
          const subagent = subagents.find((candidate) => candidate.id === span.subagentId);
          const interactive = Boolean(subagent?.child_session_id && onOpenSubagent);
          const duration = formatDuration((span.end ?? now) - span.start);
          const activate = (target: SubagentOpenTarget) => {
            if (subagent) onOpenSubagent?.(subagent, target);
          };
          const style = {
            left: `${geometry.left}%`,
            width: `${Math.max(geometry.width, 0.9)}%`,
            '--process-color': lane.color,
          } as CSSProperties;
          const content = (
            <span
              aria-label={`${span.label}, ${humanizeProtocolValue(span.status)}`}
              data-execution-span-id={span.id}
              data-execution-action={interactive ? '' : undefined}
              className={cn(
                'absolute inset-y-1 flex min-w-1 items-center overflow-hidden rounded-md border border-[color:var(--process-color)]/70 bg-[color:var(--process-color)]/20 px-1.5 text-left text-[10px] font-medium text-foreground shadow-sm outline-none',
                span.state === 'running' &&
                  'after:absolute after:inset-y-0 after:w-8 after:animate-[process-beam_1.4s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent motion-reduce:after:hidden',
                span.timing === 'observed' && 'border-dashed bg-transparent',
                interactive &&
                  'cursor-pointer hover:bg-[color:var(--process-color)]/30 focus-visible:ring-2 focus-visible:ring-ring',
              )}
              onClick={
                interactive
                  ? (event) => {
                      event.stopPropagation();
                      activate(event.shiftKey ? 'canvas' : 'conversation');
                    }
                  : undefined
              }
              onKeyDown={
                interactive
                  ? (event: KeyboardEvent<HTMLSpanElement>) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        activate(event.shiftKey ? 'canvas' : 'conversation');
                      }
                    }
                  : undefined
              }
              onMouseDown={
                interactive
                  ? (event) => {
                      event.stopPropagation();
                      if (event.shiftKey) event.preventDefault();
                    }
                  : undefined
              }
              role={interactive ? 'button' : 'img'}
              style={style}
              tabIndex={interactive ? 0 : undefined}
            >
              {geometry.width >= 16 && span.timing === 'exact' ? (
                <span className="truncate">{duration}</span>
              ) : null}
            </span>
          );
          return (
            <Tooltip key={span.id}>
              <TooltipTrigger asChild>{content}</TooltipTrigger>
              <TooltipContent className="max-w-64 space-y-1">
                <p className="font-medium">{span.label}</p>
                {span.timing === 'exact' ? (
                  <>
                    <p>
                      {formatClock(span.start)} to {span.end ? formatClock(span.end) : 'now'}
                    </p>
                    <p>{duration}</p>
                  </>
                ) : (
                  <p>Observed in its containing turn at {formatClock(span.start)}</p>
                )}
                <ClioStatus className="mt-1" value={span.status} />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

interface ProcessSpan {
  id: string;
  label: string;
  branch: string;
  owner: string;
  kind: ProcessLane['kind'];
  start: number;
  end: number | null;
  state: 'done' | 'running' | 'failed';
  status: RunState | ToolState;
  timing: 'exact' | 'observed';
  subagentId?: string;
  depth: number;
}

interface ProcessLane {
  id: string;
  label: string;
  color: string;
  kind: 'main' | AsyncProcess['kind'] | 'tool';
  depth: number;
  spans: ProcessSpan[];
}

interface TimeRange {
  start: number;
  end: number;
}

function executionSpans({
  messages,
  processes,
  runs,
  tools,
}: {
  messages: readonly Message[];
  processes: readonly AsyncProcess[];
  runs: readonly Run[];
  tools: readonly ToolInvocation[];
}): ProcessSpan[] {
  const processOwners = new Map(
    processes
      .filter(
        (process) =>
          process.kind === 'agent' && (process.owner_session_id || process.child_session_id),
      )
      .map((process) => [
        process.owner_session_id ?? process.child_session_id!,
        {
          id: process.id,
          depth: process.task_path?.length || process.depth || (process.kind === 'agent' ? 1 : 0),
        },
      ]),
  );
  const processSpans = processes
    .map((process): ProcessSpan | undefined => {
      const start = parseTimestamp(process.created_at);
      if (start === undefined) return undefined;
      const updated = parseTimestamp(process.updated_at);
      const running = ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(
        process.live_state,
      );
      return {
        id: process.id,
        label: process.title || process.id,
        branch: process.id,
        owner: process.id,
        kind: process.kind,
        start,
        end: running ? null : Math.max(start, updated ?? start),
        state:
          process.live_state === 'failed'
            ? ('failed' as const)
            : running
              ? ('running' as const)
              : ('done' as const),
        status: process.live_state,
        timing: 'exact',
        subagentId: process.id,
        depth: process.task_path?.length || process.depth || (process.kind === 'agent' ? 1 : 0),
      };
    })
    .filter((span): span is ProcessSpan => span !== undefined);
  const runSpans = runs
    .map((run): ProcessSpan | undefined => {
      const start = parseTimestamp(run.started_at);
      if (start === undefined) return undefined;
      const running = ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(
        run.state,
      );
      return {
        id: run.id,
        label: run.summary || 'Main agent',
        branch: 'main',
        owner: 'main',
        kind: 'main',
        start,
        end: running ? null : Math.max(start, parseTimestamp(run.completed_at) ?? start),
        state: run.state === 'failed' ? 'failed' : running ? 'running' : 'done',
        status: run.state,
        timing: 'exact',
        depth: 0,
      };
    })
    .filter((span): span is ProcessSpan => span !== undefined);
  const messageSpans = runSpans.length
    ? []
    : messages
        .filter(
          (message) =>
            message.role === 'assistant' && message.blocks.some((block) => block.type !== 'text'),
        )
        .map((message): ProcessSpan | undefined => {
          const at = parseTimestamp(message.completed_at ?? message.created_at);
          if (at === undefined) return undefined;
          return {
            id: message.id,
            label: 'Main agent response',
            branch: 'main',
            owner: 'main',
            kind: 'main',
            start: at,
            end: at,
            state: message.error_info ? 'failed' : 'done',
            status: message.error_info ? 'failed' : 'completed',
            timing: 'observed',
            depth: 0,
          };
        })
        .filter((span): span is ProcessSpan => span !== undefined);
  const turnTimes = toolTurnTimes(messages);
  const toolSpans = tools
    .map((tool): ProcessSpan | undefined => {
      const exactEnd = parseTimestamp(tool.completed_at);
      const exactStart =
        parseTimestamp(tool.started_at) ??
        (exactEnd !== undefined && tool.duration_ms !== undefined
          ? exactEnd - tool.duration_ms
          : undefined);
      const observedAt = turnTimes.get(tool.id);
      const start = exactStart ?? exactEnd ?? observedAt;
      if (start === undefined) return undefined;
      const processOwner = processOwners.get(tool.session_id);
      const owner = processOwner?.id ?? 'main';
      const running = tool.state === 'pending' || tool.state === 'running';
      const exact = exactStart !== undefined || exactEnd !== undefined;
      return {
        id: tool.id,
        label: getToolPresentation(tool).title,
        branch: `${owner}:tool:${tool.name}`,
        owner,
        kind: 'tool',
        start,
        end: running ? null : exact ? Math.max(start, exactEnd ?? start) : start,
        state: tool.state === 'failed' ? 'failed' : running ? 'running' : 'done',
        status: tool.state,
        timing: exact ? 'exact' : 'observed',
        depth: processOwner ? processOwner.depth + 1 : 1,
      };
    })
    .filter((span): span is ProcessSpan => span !== undefined);
  return [...runSpans, ...messageSpans, ...processSpans, ...toolSpans].sort(
    (left, right) => left.start - right.start,
  );
}

function executionLanes(spans: readonly ProcessSpan[], colors: Map<string, string>): ProcessLane[] {
  const byBranch = new Map<string, ProcessSpan[]>();
  for (const span of spans) {
    const bucket = byBranch.get(span.branch);
    if (bucket) bucket.push(span);
    else byBranch.set(span.branch, [span]);
  }
  const ownerOrder = new Map<string, number>();
  for (const span of spans) {
    if (!ownerOrder.has(span.owner)) ownerOrder.set(span.owner, ownerOrder.size);
  }
  if (spans.some((span) => span.owner === 'main')) ownerOrder.set('main', -1);
  return [...byBranch.entries()]
    .sort((left, right) => {
      const leftSpan = left[1][0]!;
      const rightSpan = right[1][0]!;
      const owner = (ownerOrder.get(leftSpan.owner) ?? 0) - (ownerOrder.get(rightSpan.owner) ?? 0);
      if (owner) return owner;
      const depth = Number(leftSpan.kind === 'tool') - Number(rightSpan.kind === 'tool');
      return depth || leftSpan.start - rightSpan.start;
    })
    .flatMap(([branch, branchSpans]) => {
      const lanes: ProcessSpan[][] = [];
      for (const span of branchSpans) {
        const available = lanes.findIndex((lane) => {
          const previous = lane.at(-1);
          return previous?.end !== null && (previous?.end ?? 0) <= span.start;
        });
        const laneIndex = available >= 0 ? available : lanes.length;
        if (!lanes[laneIndex]) lanes[laneIndex] = [];
        lanes[laneIndex]!.push(span);
      }
      return lanes.map((lane, laneIndex) => ({
        id: `${branch}:${laneIndex}`,
        label:
          lane[0]!.kind === 'main'
            ? 'Main agent'
            : laneIndex
              ? `${lane[0]!.label} #${laneIndex + 1}`
              : lane[0]!.label,
        color: colors.get(branch) ?? BRANCH_COLORS[0]!,
        kind: lane[0]!.kind,
        depth: lane[0]!.depth,
        spans: lane,
      }));
    });
}

function branchPalette(spans: readonly ProcessSpan[]): Map<string, string> {
  const branches = [...new Set(spans.map((span) => span.branch))].sort();
  return new Map(
    branches.map((branch, index) => [branch, BRANCH_COLORS[index % BRANCH_COLORS.length]!]),
  );
}

function toolTurnTimes(messages: readonly Message[]): Map<string, number> {
  const times = new Map<string, number>();
  for (const message of messages) {
    const at = parseTimestamp(message.created_at);
    if (at === undefined) continue;
    for (const block of message.blocks) {
      if (block.type === 'tool') times.set(block.tool_id, at);
    }
  }
  return times;
}

function fullExtent(spans: readonly ProcessSpan[], now: number): TimeRange {
  const start = Math.min(...spans.map((span) => span.start));
  const end = Math.max(...spans.map((span) => span.end ?? now));
  return end > start ? { start, end } : { start, end: start + 1_000 };
}

function barGeometry(span: ProcessSpan, range: TimeRange, now: number) {
  const end = span.end ?? Math.max(now, span.start);
  if (end < range.start || span.start > range.end) return undefined;
  const rawLeft = percent(span.start, range);
  const rawRight = percent(end, range);
  const left = Math.max(0, Math.min(100, rawLeft));
  const right = Math.max(0, Math.min(100, rawRight));
  return { left, width: Math.max(0, right - left) };
}

function percent(at: number, range: TimeRange): number {
  return ((at - range.start) / Math.max(1, range.end - range.start)) * 100;
}

function parseTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? undefined : timestamp;
}

function formatClock(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp);
}

function formatAxisTime(timestamp: number, range: TimeRange): string {
  const seconds = range.end - range.start < 10 * 60_000;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' as const } : {}),
  }).format(timestamp);
}

function formatWindow(range: TimeRange): string {
  return `${formatClock(range.start)} to ${formatClock(range.end)}`;
}

export function ProcessSummary({ processes }: { processes: readonly AsyncProcess[] }) {
  const active = processes.filter((process) =>
    ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(process.live_state),
  ).length;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Clock3Icon aria-hidden="true" className="size-3.5" />
      <span>{processes.length.toLocaleString()} observed processes</span>
      <ClioStatus
        className="py-0.5"
        label={active ? `${active} active` : 'All settled'}
        value={active ? 'running' : 'completed'}
      />
    </div>
  );
}
