/**
 * The observability gantt (viz rebuild, 2026-08).
 *
 * Owner direction: fanout siblings must never overlap, each branch needs its own
 * colour, and the time axis needs real zoom + pan and hover semantics. The
 * coordinate system and the gestures are `d3-scale` / `d3-zoom` (ISC) — the
 * canonical 1-D time-axis pair, `transform.rescaleX(scale)`; the RENDERING stays
 * DOM rows so the layer keeps its existing navigation contract (role/tabIndex/
 * Enter-Space), `:focus-visible` rings, hover tokens and the amber running
 * shimmer, all of which the conformance tests pin.
 *
 * Lanes, branch colours and bar geometry are computed by the pure model in
 * `ganttModel.ts` — this file owns only the React/DOM/gesture wiring.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { scaleTime } from 'd3-scale';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity, type D3ZoomEvent, type ZoomTransform } from 'd3-zoom';
import { Icon } from '../kit';
import {
  assignLanes,
  barGeometry,
  branchColor,
  fullExtent,
  percentIn,
  type BranchColorResolver,
  type GanttLane,
  type TimeWindow,
} from './ganttModel';
import type { ObsNavigation, ObsSpan } from './types';

/** The label column width, in px — must match `.obs-gantt__row`'s first grid
 *  track in observability.css, because the zoom scale's range is expressed in
 *  the plot element's own coordinate space (which starts at the label column). */
const LABEL_COLUMN_PX = 180;
/** Lane width assumed when the element has not been measured yet (jsdom, and the
 *  first paint before the ResizeObserver fires). Geometry stays deterministic. */
const FALLBACK_LANE_PX = 600;
/** Deepest zoom: 400x the full extent — a 10-minute trace resolves to ~1.5s. */
const MAX_ZOOM = 400;
/** Row-render defect A6 (owner-quoted, narrow obs modal): pixels reserved
 *  from the plot's right edge for a bar's duration label, so it always has
 *  real room to render into — enough for the longest realistic label
 *  ("16m 40s", the pinned test's own worst case) plus its `padding-left`,
 *  never just a bare geometry percentage that a narrow container squeezes
 *  to nothing. See {@link GanttBar}'s duration span. */
const DURATION_LABEL_RESERVE_PX = 72;
/** How often a running bar's right edge is re-evaluated against the wall clock. */
const LIVE_TICK_MS = 1_000;

export interface GanttProps {
  spans: ObsSpan[];
  /** The layer's single branch palette, composed once in `Observability` so the
   *  gantt and the log rail can never disagree about an agent's colour. */
  colorOf?: BranchColorResolver;
  onNavigate?: (nav: ObsNavigation) => void;
}

interface HoverState {
  lane: GanttLane;
  span: ObsSpan;
  x: number;
  y: number;
}

export function Gantt({ spans, colorOf = branchColor, onNavigate }: GanttProps) {
  const plotRef = useRef<HTMLDivElement | null>(null);
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity);
  const [plotWidth, setPlotWidth] = useState(LABEL_COLUMN_PX + FALLBACK_LANE_PX);
  const [hover, setHover] = useState<HoverState | null>(null);

  const hasRunning = spans.some((span) => span.endMs === null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasRunning) return;
    const timer = setInterval(() => setNow(Date.now()), LIVE_TICK_MS);
    return () => clearInterval(timer);
  }, [hasRunning]);

  const lanes = useMemo(() => assignLanes(spans, colorOf), [spans, colorOf]);
  const extent = useMemo(() => fullExtent(spans, now), [spans, now]);
  // A running span has not ended, so its bar must reach the right edge of what
  // we know — `now`, or the newest recorded event when the browser clock is
  // BEHIND the backend's stamps (real cross-surface skew this app has hit
  // before). Never past the data: `extent.max` already accounts for `now`.
  const liveEdge = Math.max(now, extent.max);

  // Measure the plot so the zoom focal point lands on the timestamp under the
  // pointer. Without a real width (jsdom, first paint) the fallback keeps the
  // geometry deterministic rather than collapsing every bar to zero.
  useEffect(() => {
    const node = plotRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > LABEL_COLUMN_PX) setPlotWidth(width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const laneWidth = Math.max(1, plotWidth - LABEL_COLUMN_PX);

  // The base scale's RANGE is expressed in the plot element's own coordinates
  // (it starts at the label column, not at 0) so d3-zoom's pointer maths — which
  // measures against that same element — needs no offset correction.
  const base = useMemo(
    () => scaleTime().domain([extent.min, extent.max]).range([LABEL_COLUMN_PX, LABEL_COLUMN_PX + laneWidth]),
    [extent.min, extent.max, laneWidth],
  );

  const view = useMemo(() => transform.rescaleX(base), [transform, base]);
  const windowRange: TimeWindow = useMemo(
    () => ({
      min: view.invert(LABEL_COLUMN_PX).getTime(),
      max: view.invert(LABEL_COLUMN_PX + laneWidth).getTime(),
    }),
    [view, laneWidth],
  );

  const zoomBehavior = useMemo(
    () =>
      d3zoom<HTMLDivElement, unknown>()
        .scaleExtent([1, MAX_ZOOM])
        // Both extents are in the plot element's coordinates; clamping the
        // translate extent to the data window means panning can never scroll off
        // the trace into empty time.
        .extent((): [[number, number], [number, number]] => [
          [LABEL_COLUMN_PX, 0],
          [LABEL_COLUMN_PX + laneWidth, 1],
        ])
        .translateExtent([
          [LABEL_COLUMN_PX, Number.NEGATIVE_INFINITY],
          [LABEL_COLUMN_PX + laneWidth, Number.POSITIVE_INFINITY],
        ])
        // A bar click must still reach its navigation handler; d3-zoom only
        // suppresses the click when the pointer actually moved.
        .clickDistance(4),
    [laneWidth],
  );

  useEffect(() => {
    const node = plotRef.current;
    if (!node) return;
    const selection = select(node);
    zoomBehavior.on('zoom', (event: D3ZoomEvent<HTMLDivElement, unknown>) => {
      setTransform(event.transform);
    });
    selection.call(zoomBehavior);
    // The panel scrolls vertically; a bare double-click reset is friendlier than
    // d3's default double-click-to-zoom, which fights the surrounding surface.
    selection.on('dblclick.zoom', null);
    return () => {
      selection.on('.zoom', null);
    };
  }, [zoomBehavior]);

  const applyZoom = useCallback(
    (factor: number) => {
      const node = plotRef.current;
      if (!node) return;
      select(node).call(zoomBehavior.scaleBy, factor);
    },
    [zoomBehavior],
  );

  const resetZoom = useCallback(() => {
    const node = plotRef.current;
    if (!node) {
      setTransform(zoomIdentity);
      return;
    }
    select(node).call(zoomBehavior.transform, zoomIdentity);
    setTransform(zoomIdentity);
  }, [zoomBehavior]);

  const ticks = useMemo(() => {
    const count = Math.max(3, Math.min(8, Math.round(laneWidth / 110)));
    return view
      .ticks(count)
      .map((at) => ({ at: at.getTime(), percent: percentIn(at.getTime(), windowRange) }))
      .filter((tick) => tick.percent >= -1 && tick.percent <= 101);
  }, [view, windowRange, laneWidth]);

  const zoomed = transform.k > 1.001;

  return (
    <div className="obs-gantt" data-testid="obs-gantt">
      <div className="obs-gantt__controls">
        <span className="obs-gantt__window" data-testid="obs-gantt-window">
          {formatWindow(windowRange)}
        </span>
        <span className="obs-gantt__zoomgroup" role="group" aria-label="Timeline zoom">
          <button
            type="button"
            className="obs-gantt__zoombtn"
            title="Zoom out"
            aria-label="Zoom out"
            onClick={() => applyZoom(1 / 1.6)}
          >
            −
          </button>
          <button
            type="button"
            className="obs-gantt__zoombtn"
            title="Zoom in"
            aria-label="Zoom in"
            onClick={() => applyZoom(1.6)}
          >
            +
          </button>
          <button
            type="button"
            className="obs-gantt__zoombtn obs-gantt__zoombtn--fit"
            title="Fit the whole trace"
            aria-label="Fit the whole trace"
            data-zoomed={zoomed ? 'true' : undefined}
            onClick={resetZoom}
          >
            fit
          </button>
        </span>
        <span className="obs-gantt__hint">scroll to zoom · drag to pan</span>
      </div>

      <div className="obs-gantt__plot" ref={plotRef} data-testid="obs-gantt-plot">
        <div className="obs-gantt__axis">
          <span className="obs-gantt__axis-spacer" />
          <span className="obs-gantt__ticks">
            {ticks.map((tick) => (
              <time className="obs-gantt__tick" key={tick.at} style={{ left: `${tick.percent}%` }}>
                {formatAxisTime(tick.at, windowRange)}
              </time>
            ))}
          </span>
        </div>

        {lanes.map((lane) => (
          <GanttRow
            key={lane.id}
            lane={lane}
            window={windowRange}
            now={liveEdge}
            onHover={setHover}
            {...(onNavigate ? { onNavigate } : {})}
          />
        ))}
      </div>

      {hover ? <GanttTooltip hover={hover} /> : null}
    </div>
  );
}

interface GanttRowProps {
  lane: GanttLane;
  window: TimeWindow;
  now: number;
  onHover: (hover: HoverState | null) => void;
  onNavigate?: (nav: ObsNavigation) => void;
}

function GanttRow({ lane, window: view, now, onHover, onNavigate }: GanttRowProps) {
  const clickable = Boolean(lane.nav && onNavigate);
  const activate = clickable ? () => onNavigate!(lane.nav!) : undefined;
  return (
    <div
      className="obs-gantt__row"
      data-depth={lane.depth}
      data-branch={lane.branch}
      data-lane={lane.laneIndex}
      data-nav={clickable ? 'true' : 'false'}
      style={{ '--obs-branch': lane.color } as CSSProperties}
      {...(clickable
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: activate,
            onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                activate!();
              }
            },
          }
        : {})}
    >
      <span className="obs-gantt__label" style={{ paddingLeft: `${lane.depth * 9}px` }}>
        <span className="obs-gantt__swatch" aria-hidden="true" />
        <span className="obs-gantt__labeltext" title={lane.label}>
          {lane.laneIndex > 0 ? <span className="obs-gantt__cont" aria-hidden="true">↳ </span> : null}
          {lane.label}
        </span>
      </span>
      <span className="obs-gantt__lane">
        {lane.spans.map((span) => (
          <GanttBar
            key={span.id}
            lane={lane}
            span={span}
            window={view}
            now={now}
            onHover={onHover}
          />
        ))}
      </span>
    </div>
  );
}

interface GanttBarProps {
  lane: GanttLane;
  span: ObsSpan;
  window: TimeWindow;
  now: number;
  onHover: (hover: HoverState | null) => void;
}

function GanttBar({ lane, span, window: view, now, onHover }: GanttBarProps) {
  const geometry = barGeometry(span, view, now);
  if (!geometry) return null;

  // Marks keep their REAL timestamps. An artifact with no recorded mint time
  // falls back to the span's own end, exactly as before — never a fabricated
  // position; a mark outside the visible window is simply not drawn.
  const artifactTimes = span.artifactAtMs?.length
    ? span.artifactAtMs
    : Array.from({ length: span.artifacts ?? 0 }, () => span.endMs ?? span.startMs);

  const enter = (event: React.MouseEvent) =>
    onHover({ lane, span, x: event.clientX, y: event.clientY });

  // In-bar text is drawn only when it ADDS something: a lane holding one span
  // already names it in the label column, so repeating it inside the bar only
  // collides with the tool marks sitting at their own real timestamps. It is
  // likewise suppressed on a bar too narrow to hold it rather than allowed to
  // spill across a neighbour on the same lane (a 2s spawn call next to a 3m
  // wait). The hover tooltip always carries the full detail, so nothing becomes
  // unreachable — it just stops being drawn on top of something else.
  const showLabel = span.label !== lane.label && geometry.width >= 6;
  const showDuration = geometry.width >= 3;

  return (
    <>
      <span
        className="obs-gantt__bar"
        data-state={span.state}
        data-testid="obs-gantt-bar"
        title={span.label}
        {...(span.tool ? { 'data-tool': 'true' } : {})}
        {...(geometry.clippedStart ? { 'data-clip-start': 'true' } : {})}
        {...(geometry.clippedEnd ? { 'data-clip-end': 'true' } : {})}
        style={{ left: `${geometry.left}%`, width: `${geometry.width}%` }}
        onMouseEnter={enter}
        onMouseMove={enter}
        onMouseLeave={() => onHover(null)}
      >
        {showLabel ? <span className="obs-gantt__barlabel">{span.label}</span> : null}
      </span>
      {(span.toolMarks ?? []).map((mark, index) => {
        const percent = percentIn(mark.atMs, view);
        if (percent < 0 || percent > 100) return null;
        return (
          <span
            className="obs-gantt__toolmark"
            title={mark.label}
            aria-label={`tool ${mark.label}`}
            key={`${mark.atMs}-${mark.label}-${index}`}
            style={{ left: `${percent}%` }}
          >
            <Icon name="wrench" size={6} />
          </span>
        );
      })}
      {artifactTimes.map((at, index) => {
        const percent = percentIn(at, view);
        if (percent < 0 || percent > 100) return null;
        return (
          <span
            className="obs-gantt__artifact"
            aria-label="artifact"
            key={`${at}-${index}`}
            style={{ left: `${Math.min(percent, 99.5)}%` }}
          >
            ◆
          </span>
        );
      })}
      {span.duration && showDuration ? (
        <span
          className="obs-gantt__duration"
          data-testid="obs-gantt-duration"
          // Row-render defect A6 (owner-quoted, narrow obs modal): a bare
          // percentage `left` (up to the 97% cap below) left only a handful
          // of REAL pixels before the plot's `overflow: hidden` cut the
          // nowrap label off mid-character ("3m 58s" -> "3m 4"). `min()`
          // combines the geometry-driven percentage with a PIXEL floor —
          // DURATION_LABEL_RESERVE_PX worth of room from the plot's right
          // edge — so the label always has real space to render into,
          // however narrow the container. Unconditional: even a bar nowhere
          // near the right edge still carries the same reservation, it just
          // never binds (the percentage term wins there).
          style={{ left: `min(${Math.min(geometry.left + geometry.width, 97)}%, calc(100% - ${DURATION_LABEL_RESERVE_PX}px))` }}
        >
          {span.duration}
        </span>
      ) : null}
    </>
  );
}

/** Hover detail: the agent, the real span window, its duration and its state.
 *  Every value is read off the span — nothing here is computed prose. */
function GanttTooltip({ hover }: { hover: HoverState }) {
  const { lane, span } = hover;
  return (
    <div
      className="obs-gantt__tip"
      data-testid="obs-gantt-tooltip"
      role="tooltip"
      style={{ left: `${hover.x}px`, top: `${hover.y}px`, '--obs-branch': lane.color } as CSSProperties}
    >
      <span className="obs-gantt__tipname">{span.label}</span>
      <span className="obs-gantt__tipagent">{lane.branch}</span>
      <span className="obs-gantt__tiprow">
        {formatClock(span.startMs)}
        {' → '}
        {span.endMs === null ? 'running' : formatClock(span.endMs)}
      </span>
      {span.duration ? <span className="obs-gantt__tiprow">{span.duration}</span> : null}
      <span className="obs-gantt__tipstate" data-state={span.state}>
        {span.state}
      </span>
    </div>
  );
}

/** `19:52:07` — the wall clock a hovered span really started/ended at. */
function formatClock(at: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

/** Axis labels gain seconds once the visible window is short enough that
 *  minute-only stamps would repeat — the axis never shows two identical ticks. */
function formatAxisTime(at: number, view: TimeWindow): string {
  const showSeconds = view.max - view.min < 10 * 60_000;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' as const } : {}),
    hourCycle: 'h23',
  }).format(at);
}

/** The visible window's own span, e.g. `4m 12s window`. */
function formatWindow(view: TimeWindow): string {
  const ms = Math.max(0, view.max - view.min);
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s window`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return rest > 0 ? `${minutes}m ${rest}s window` : `${minutes}m window`;
}
