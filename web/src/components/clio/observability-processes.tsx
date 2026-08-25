import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { scaleTime } from 'd3-scale';
import { select } from 'd3-selection';
import { zoom as d3Zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import { BoxesIcon, Clock3Icon, MinusIcon, PlusIcon, ScanIcon, ServerCogIcon } from 'lucide-react';
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
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { SubagentOpenTarget } from './subagent-card';
import { ClioStatus } from './status';

const LABEL_COLUMN_PX = 148;
const FALLBACK_PLOT_PX = 420;
const MAX_ZOOM = 200;
const BRANCH_COLORS = ['#22d3ee', '#60a5fa', '#a78bfa', '#34d399', '#fb7185', '#facc15'];

interface ClioProcessLanesProps {
  processes: readonly AsyncProcess[];
  subagents?: readonly SubagentRun[];
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

/** Zoomable execution Gantt adapted from the proven pre-rebuild observability surface. */
export function ClioProcessLanes({
  processes,
  subagents = [],
  onOpenSubagent,
}: ClioProcessLanesProps) {
  const spans = useMemo(() => processSpans(processes), [processes]);
  const branches = useMemo(() => branchPalette(spans), [spans]);
  const lanes = useMemo(() => processLanes(spans, branches), [branches, spans]);
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
  const laneWidth = Math.max(1, plotWidth - LABEL_COLUMN_PX);
  const baseScale = useMemo(
    () =>
      scaleTime()
        .domain([extent.start, extent.end])
        .range([LABEL_COLUMN_PX, LABEL_COLUMN_PX + laneWidth]),
    [extent.end, extent.start, laneWidth],
  );
  const visibleScale = useMemo(() => transform.rescaleX(baseScale), [baseScale, transform]);
  const windowRange = useMemo(
    () => ({
      start: visibleScale.invert(LABEL_COLUMN_PX).getTime(),
      end: visibleScale.invert(LABEL_COLUMN_PX + laneWidth).getTime(),
    }),
    [laneWidth, visibleScale],
  );
  const zoom = useMemo(
    () =>
      d3Zoom<HTMLDivElement, unknown>()
        .scaleExtent([1, MAX_ZOOM])
        .extent((): [[number, number], [number, number]] => [
          [LABEL_COLUMN_PX, 0],
          [LABEL_COLUMN_PX + laneWidth, 1],
        ])
        .translateExtent([
          [LABEL_COLUMN_PX, Number.NEGATIVE_INFINITY],
          [LABEL_COLUMN_PX + laneWidth, Number.POSITIVE_INFINITY],
        ])
        .clickDistance(4),
    [laneWidth],
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
  const ticks = useMemo(
    () =>
      visibleScale
        .ticks(Math.max(3, Math.min(7, Math.round(laneWidth / 100))))
        .map((at) => ({ at: at.getTime(), left: percent(at.getTime(), windowRange) }))
        .filter((tick) => tick.left >= 0 && tick.left <= 100),
    [laneWidth, visibleScale, windowRange],
  );

  if (!lanes.length) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
        No background or child-agent processes were recorded for this session.
      </p>
    );
  }

  return (
    <TooltipProvider delayDuration={240}>
      <Frame spacing="sm" variant="ghost">
        <FrameHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <FrameTitle>Execution timeline</FrameTitle>
            <FrameDescription>
              Every recorded process is preserved. Bars show concurrency from real timestamps, never
              completion percentage.
            </FrameDescription>
          </div>
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
          <div className="flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
            <span className="font-mono tabular-nums">{formatWindow(windowRange)}</span>
            <span>Scroll to zoom. Drag to pan.</span>
          </div>
          <div
            aria-label="Observed execution spans"
            className="touch-none select-none overflow-hidden rounded-lg border bg-background/40"
            ref={plotRef}
            role="region"
          >
            <div className="grid grid-cols-[9.25rem_minmax(15rem,1fr)] border-b bg-muted/30">
              <div className="border-r px-2 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Process
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
  now,
  onOpenSubagent,
  subagents,
  windowRange,
}: {
  lane: ProcessLane;
  now: number;
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
  subagents: readonly SubagentRun[];
  windowRange: TimeRange;
}) {
  return (
    <div className="grid min-h-11 grid-cols-[9.25rem_minmax(15rem,1fr)] border-b last:border-b-0">
      <div className="flex min-w-0 items-center gap-1.5 border-r px-2 py-1.5">
        {lane.kind === 'agent' ? (
          <BoxesIcon
            aria-hidden="true"
            className="size-3.5 shrink-0"
            style={{ color: lane.color }}
          />
        ) : (
          <ServerCogIcon aria-hidden="true" className="size-3.5 shrink-0 text-action" />
        )}
        <span className="min-w-0 truncate text-xs font-medium" title={lane.label}>
          {lane.label}
        </span>
      </div>
      <div className="relative min-h-11 overflow-hidden bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px)] bg-[size:25%_100%]">
        {lane.spans.map((span) => {
          const geometry = barGeometry(span, windowRange, now);
          if (!geometry) return null;
          const subagent = subagents.find((candidate) => candidate.id === span.process.id);
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
              className={cn(
                'absolute inset-y-1 flex min-w-1 items-center overflow-hidden rounded-md border border-[color:var(--process-color)]/70 bg-[color:var(--process-color)]/20 px-1.5 text-left text-[10px] font-medium text-foreground shadow-sm outline-none',
                span.state === 'running' &&
                  'after:absolute after:inset-y-0 after:w-8 after:animate-[process-beam_1.4s_ease-in-out_infinite] after:bg-gradient-to-r after:from-transparent after:via-white/25 after:to-transparent motion-reduce:after:hidden',
                interactive &&
                  'cursor-pointer hover:bg-[color:var(--process-color)]/30 focus-visible:ring-2 focus-visible:ring-ring',
              )}
              onClick={interactive ? () => activate('conversation') : undefined}
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
                interactive ? (event) => event.shiftKey && event.preventDefault() : undefined
              }
              role={interactive ? 'button' : undefined}
              style={style}
              tabIndex={interactive ? 0 : undefined}
            >
              {geometry.width >= 16 ? <span className="truncate">{duration}</span> : null}
            </span>
          );
          return (
            <Tooltip key={span.process.id}>
              <TooltipTrigger asChild>{content}</TooltipTrigger>
              <TooltipContent className="max-w-64 space-y-1">
                <p className="font-medium">{span.process.title}</p>
                <p>
                  {formatClock(span.start)} to {span.end ? formatClock(span.end) : 'now'}
                </p>
                <p>{duration}</p>
                <ClioStatus className="mt-1" value={span.process.live_state} />
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

interface ProcessSpan {
  process: AsyncProcess;
  branch: string;
  start: number;
  end: number | null;
  state: 'done' | 'running' | 'failed';
}

interface ProcessLane {
  id: string;
  label: string;
  color: string;
  kind: AsyncProcess['kind'];
  spans: ProcessSpan[];
}

interface TimeRange {
  start: number;
  end: number;
}

function processSpans(processes: readonly AsyncProcess[]): ProcessSpan[] {
  return processes
    .map((process) => {
      const start = parseTimestamp(process.created_at);
      if (start === undefined) return undefined;
      const updated = parseTimestamp(process.updated_at);
      const running = ['queued', 'running', 'waiting_permission', 'waiting_user'].includes(
        process.live_state,
      );
      return {
        process,
        branch: process.title || process.id,
        start,
        end: running ? null : Math.max(start, updated ?? start),
        state:
          process.live_state === 'failed'
            ? ('failed' as const)
            : running
              ? ('running' as const)
              : ('done' as const),
      };
    })
    .filter((span): span is ProcessSpan => span !== undefined)
    .sort((left, right) => left.start - right.start);
}

function processLanes(spans: readonly ProcessSpan[], colors: Map<string, string>): ProcessLane[] {
  const byBranch = new Map<string, ProcessSpan[]>();
  for (const span of spans) {
    const bucket = byBranch.get(span.branch);
    if (bucket) bucket.push(span);
    else byBranch.set(span.branch, [span]);
  }
  return [...byBranch.entries()]
    .sort((left, right) => left[1][0]!.start - right[1][0]!.start)
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
        label: laneIndex ? `${branch} #${laneIndex + 1}` : branch,
        color: colors.get(branch) ?? BRANCH_COLORS[0]!,
        kind: lane[0]!.process.kind,
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

function formatDuration(milliseconds: number): string {
  if (milliseconds < 1_000) return `${Math.max(Math.round(milliseconds), 0)} ms`;
  if (milliseconds < 60_000) return `${Math.round(milliseconds / 1_000)} s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1_000);
  return seconds ? `${minutes}m ${seconds}s` : `${minutes} min`;
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
