import { useState, type CSSProperties } from 'react';
import { Chip, Eyebrow, Select, Tabs, type TabDef } from '../kit';
import type { ObsContext, ObsRun, ObsSpan, ObsTimelineKind, ObservabilityData } from './types';
import './observability.css';

export interface ObservabilityProps {
  data: ObservabilityData;
  /** Layer owners render the trace state in their shared header row. */
  showTraceHeader?: boolean;
  /** Tab to land on when the layer opens — the pill chips deep-link here. */
  initialTab?: ObsTab;
}

export type ObsTab = 'agents' | 'timeline' | 'runs' | 'tools' | 'artifacts' | 'context';
type TimelineMode = 'log' | 'gantt';

const GLYPHS: Record<ObsTimelineKind, string> = {
  event: '○',
  tool: '◉',
  artifact: '◆',
  failure: '×',
  running: '●',
};

/** Inline trace label shared by the standalone contract and Layer header. */
export function ObservabilityTrace() {
  return (
    <span className="obs__trace" data-testid="obs-trace">
      <span className="obs__trace-scope">session trace</span>
      <span className="obs__trace-state" data-live="true">
        · live
      </span>
    </span>
  );
}

/** The session observability layer: live timeline, runs, tools, artifacts and context. */
export function Observability({ data, showTraceHeader = true, initialTab }: ObservabilityProps) {
  const legacy =
    data.timeline === undefined && data.spans === undefined && data.artifactRows === undefined;
  const [tab, setTab] = useState<ObsTab>(initialTab ?? (legacy ? 'agents' : 'timeline'));
  const [timelineMode, setTimelineMode] = useState<TimelineMode>('log');
  const experts = Object.keys(data.toolsByExpert);
  const [expert, setExpert] = useState(experts[0] ?? '');
  const selectedExpert = data.toolsByExpert[expert] ? expert : (experts[0] ?? '');
  const timeline = data.timeline ?? [];
  const spans = data.spans ?? [];
  const artifactRows = data.artifactRows ?? [];
  const toolCount = Object.values(data.toolsByExpert).reduce(
    (count, tools) => count + tools.length,
    0,
  );
  const activeTab = !legacy && tab === 'agents' ? 'timeline' : tab;
  const tabs: TabDef[] = legacy
    ? [
        { id: 'agents', label: 'agents', badge: data.agents.length || undefined },
        { id: 'runs', label: 'runs', badge: data.runs.length || undefined },
        { id: 'tools', label: 'tools' },
        { id: 'artifacts', label: 'artifacts', badge: data.artifacts.length || undefined },
        { id: 'context', label: 'context' },
      ]
    : [
        { id: 'timeline', label: 'timeline' },
        { id: 'runs', label: 'runs', badge: data.runs.length },
        { id: 'tools', label: 'tools', badge: toolCount },
        { id: 'artifacts', label: 'artifacts', badge: artifactRows.length },
        { id: 'context', label: 'context' },
      ];

  const isEmpty = legacy
    ? data.agents.length === 0 &&
      data.runs.length === 0 &&
      experts.length === 0 &&
      data.artifacts.length === 0
    : timeline.length === 0 &&
      spans.length === 0 &&
      data.runs.length === 0 &&
      experts.length === 0 &&
      artifactRows.length === 0;

  return (
    <section className="obs" aria-label="Observability">
      {showTraceHeader ? <ObservabilityTrace /> : null}

      <div className="obs__tabs">
        <Tabs
          label="Observability views"
          activeId={activeTab}
          onChange={(id) => setTab(id as ObsTab)}
          tabs={tabs}
          variant="quiet"
        />
      </div>

      <div className="obs__body">
        {legacy && isEmpty ? (
          <p className="obs__empty" data-testid="obs-empty">
            no trace recorded for this session
          </p>
        ) : null}

        {activeTab === 'timeline' ? (
          <Timeline
            rows={timeline}
            spans={spans}
            mode={timelineMode}
            onModeChange={setTimelineMode}
          />
        ) : null}

        {activeTab === 'agents' ? (
          <ul className="obs__list" data-testid="obs-agents">
            {data.agents.map((agent) => (
              <li
                className="obs__row"
                key={agent.id}
                style={{ paddingLeft: `${agent.depth * 14}px` }}
              >
                <span className="obs__label">{agent.label}</span>
                <Chip tone={agent.status === 'failed' ? 'error' : 'default'}>{agent.status}</Chip>
                {agent.duration ? <span className="obs__meta">{agent.duration}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {activeTab === 'runs' ? (
          <ul className="obs__list obs-runs" data-testid="obs-runs">
            {data.runs.map((run) => (
              <li className="obs-run__row" key={run.id}>
                <span className="obs-run__identity">
                  <span className="obs-run__label">{run.label ?? run.id}</span>
                  {run.label && run.label !== run.id ? (
                    <span className="obs-run__id">{run.id}</span>
                  ) : null}
                </span>
                {run.agent ? <span className="obs-run__agent">{run.agent}</span> : null}
                <span className="obs-run__state" data-state={run.state.toLowerCase()}>
                  {run.state}
                </span>
                {run.host ? <span className="obs-run__host">{run.host}</span> : null}
                {run.duration ? <span className="obs-run__duration">{run.duration}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}

        {activeTab === 'tools' ? (
          <div data-testid="obs-tools">
            <div className="obs__toolbar">
              <Select
                label="Expert"
                value={selectedExpert}
                options={experts.map((id) => ({ id, label: id }))}
                onChange={setExpert}
              />
              <span className="obs__meta" data-testid="obs-tools-count">
                {(data.toolsByExpert[selectedExpert] ?? []).length} tools
              </span>
            </div>
            <ul className="obs__list obs-tools__list">
              {(data.toolsByExpert[selectedExpert] ?? []).map((tool) => (
                <li className="obs-tool__row" key={tool.name}>
                  <span className="obs-tool__name">{tool.name}</span>
                  {tool.description ? (
                    <span className="obs-tool__description">{tool.description}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {activeTab === 'artifacts' ? (
          artifactRows.length > 0 ? (
            <ul className="obs-artifacts" data-testid="obs-artifacts">
              {artifactRows.map((artifact, index) => (
                <li
                  className="obs-artifact__row"
                  data-testid="obs-artifact-row"
                  key={`${artifact.name}-${artifact.at}-${index}`}
                >
                  <time className="obs-artifact__time">{artifact.at}</time>
                  <span className="obs-artifact__glyph" aria-hidden="true">
                    ◆
                  </span>
                  <span className="obs-artifact__name">{artifact.name}</span>
                  <span className="obs-artifact__producer">· {artifact.producer}</span>
                  <span className="obs-artifact__meta">{artifact.meta}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="obs__list" data-testid="obs-artifacts">
              {data.artifacts.map((artifact) => (
                <li className="obs__row" key={artifact.id}>
                  <span className="obs__label">{artifact.label}</span>
                  {artifact.kind ? <span className="obs__meta">{artifact.kind}</span> : null}
                </li>
              ))}
            </ul>
          )
        ) : null}

        {activeTab === 'context' ? (
          <ContextTab context={data.context} runs={data.runs} />
        ) : null}
      </div>
    </section>
  );
}

/** Non-terminal run states — anything else counts as "live now". Mirrors
 *  SessionView's TERMINAL_AGENT_TASK_STATUSES; kept local since ObsRun.state
 *  is a display string, not the raw wire enum SessionView normalizes. */
const TERMINAL_RUN_STATES = new Set([
  'completed',
  'failed',
  'cancelled',
  'detached',
  'done',
  'error',
]);

interface ContextTabProps {
  context?: ObsContext;
  runs: ObsRun[];
}

/**
 * The context tab — progress bar + hero stat, real/degraded telemetry tiles,
 * and a live-jobs box built from the SAME `runs` the runs tab already shows
 * (no separate fetch). Relay latency and thinking-token counts have no wire
 * source (SPEC has neither), so they render an honest "not reported" tile
 * rather than a fabricated estimate — the no-silent-fallback rule.
 */
function ContextTab({ context, runs }: ContextTabProps) {
  if (!context) {
    return (
      <div className="obs-context" data-testid="obs-context">
        <p className="obs__empty">No context measurement reported for this session.</p>
      </div>
    );
  }
  const liveRuns = runs.filter((run) => !TERMINAL_RUN_STATES.has(run.state.toLowerCase()));
  return (
    <div className="obs-context" data-testid="obs-context">
      <div className="obs-context__hero">
        <Eyebrow>context window</Eyebrow>
        <span className="obs-context__hero-value">
          {context.tokens.toLocaleString('en-US')} / {context.limit.toLocaleString('en-US')} ·{' '}
          {context.usedPercent}%
        </span>
      </div>
      <div className="obs-context__bar">
        <span style={{ width: `${Math.min(100, Math.max(0, context.usedPercent))}%` }} />
      </div>

      <div className="obs-context__tiles">
        <ContextTile label="relay latency" value={null} />
        <ContextTile label="thinking tokens" value={null} />
        <ContextTile
          label="cost"
          value={context.costUsd !== undefined ? `$${context.costUsd.toFixed(2)}` : null}
          meta={context.costUsd !== undefined ? 'incl. subagents' : undefined}
        />
      </div>

      {liveRuns.length > 0 ? (
        <div className="obs-context__live" data-testid="obs-context-live">
          <Eyebrow strong>live now · {liveRuns.length}</Eyebrow>
          <ul>
            {liveRuns.map((run) => (
              <li key={run.id}>
                <span className="obs-context__live-label">{run.label ?? run.id}</span>
                {run.agent ? <span className="obs-context__live-meta">{run.agent}</span> : null}
                {run.host ? <span className="obs-context__live-meta">{run.host}</span> : null}
                {run.duration ? <span className="obs-context__live-meta">{run.duration}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ContextTile({ label, value, meta }: { label: string; value: string | null; meta?: string }) {
  return (
    <div className="obs-context__tile" {...(value === null ? { 'data-unbacked': 'true' } : {})}>
      <Eyebrow>{label}</Eyebrow>
      <strong>{value ?? 'not reported'}</strong>
      {meta ? <span>{meta}</span> : null}
    </div>
  );
}

interface TimelineProps {
  rows: NonNullable<ObservabilityData['timeline']>;
  spans: NonNullable<ObservabilityData['spans']>;
  mode: TimelineMode;
  onModeChange: (mode: TimelineMode) => void;
}

function Timeline({ rows, spans, mode, onModeChange }: TimelineProps) {
  return (
    <div className="obs-timeline" data-testid="obs-timeline">
      <div className="obs-timeline__toolbar">
        <div className="obs-timeline__modes" aria-label="Timeline display">
          {(['log', 'gantt'] as const).map((choice) => (
            <button
              type="button"
              className="obs-timeline__mode"
              aria-pressed={mode === choice}
              key={choice}
              onClick={() => onModeChange(choice)}
            >
              {choice}
            </button>
          ))}
        </div>
        <div className="obs-legend" data-testid="obs-legend">
          {(Object.keys(GLYPHS) as ObsTimelineKind[]).map((kind) => (
            <span className="obs-legend__item" data-kind={kind} key={kind}>
              <span className="obs-legend__glyph" aria-hidden="true">
                {GLYPHS[kind]}
              </span>
              {kind}
            </span>
          ))}
        </div>
      </div>

      {mode === 'log' ? (
        rows.length > 0 ? (
          <ol className="obs-log">
            {rows.map((row, index) => (
              <li
                className="obs-log__row"
                data-kind={row.kind}
                key={row.sourceId ?? `${row.at ?? ''}-${row.actor}-${row.action}-${index}`}
                style={{ '--obs-depth': row.depth ?? 0 } as CSSProperties}
              >
                <span className="obs-log__thread" aria-hidden="true">
                  <span className="obs-log__node">{GLYPHS[row.kind]}</span>
                </span>
                <time className="obs-log__time">{row.at ?? ''}</time>
                <span className="obs-log__actor">{row.actor}</span>
                <span className="obs-log__action">{row.action}</span>
                {row.duration ? <span className="obs-log__duration">({row.duration})</span> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="obs__empty" data-testid="obs-empty">
            no trace recorded for this session
          </p>
        )
      ) : spans.length > 0 ? (
        <Gantt spans={spans} />
      ) : (
        <p className="obs__empty" data-testid="obs-empty">
          no trace recorded for this session
        </p>
      )}
    </div>
  );
}

function Gantt({ spans }: { spans: ObsSpan[] }) {
  const bounds = ganttBounds(spans);
  const ticks = Array.from({ length: 6 }, (_, index) => {
    const ratio = index / 5;
    return { at: bounds.min + bounds.range * ratio, ratio };
  });

  return (
    <div className="obs-gantt">
      <div className="obs-gantt__axis">
        <span className="obs-gantt__axis-spacer" />
        <span className="obs-gantt__ticks">
          {ticks.map((tick) => (
            <time
              className="obs-gantt__tick"
              key={tick.ratio}
              style={{ left: `${tick.ratio * 100}%` }}
            >
              {formatAxisTime(tick.at)}
            </time>
          ))}
        </span>
      </div>

      {spans.map((span) => {
        const rawLeft = percentAt(span.startMs, bounds);
        const left = span.state === 'running' ? Math.min(rawLeft, 88) : Math.min(rawLeft, 98);
        const end = span.endMs ?? bounds.max;
        const rawWidth = Math.max(0, percentAt(end, bounds) - rawLeft);
        const width = Math.min(100 - left, Math.max(span.state === 'running' ? 10 : 1, rawWidth));
        const markerTimes = span.artifactAtMs?.length
          ? span.artifactAtMs
          : Array.from({ length: span.artifacts ?? 0 }, () => span.endMs ?? span.startMs);

        return (
          <div className="obs-gantt__row" data-depth={span.depth} key={span.id}>
            <span className="obs-gantt__label" style={{ paddingLeft: `${span.depth * 9}px` }}>
              {span.label}
            </span>
            <span className="obs-gantt__lane">
              <span
                className="obs-gantt__bar"
                data-state={span.state}
                style={{ left: `${left}%`, width: `${width}%` }}
              >
                {span.tool ? <span aria-hidden="true">◉</span> : null}
                {span.state === 'running' ? 'running' : null}
              </span>
              {markerTimes.map((time, index) => (
                <span
                  className="obs-gantt__artifact"
                  aria-label="artifact"
                  key={`${time}-${index}`}
                  style={{ left: `${Math.min(percentAt(time, bounds), 99)}%` }}
                >
                  ◆
                </span>
              ))}
              {span.duration ? (
                <span
                  className="obs-gantt__duration"
                  style={{ left: `${Math.min(left + width, 97)}%` }}
                >
                  {span.duration}
                </span>
              ) : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface GanttBounds {
  min: number;
  max: number;
  range: number;
}

function ganttBounds(spans: ObsSpan[]): GanttBounds {
  const timestamps = spans.flatMap((span) => [
    span.startMs,
    ...(span.endMs === null ? [] : [span.endMs]),
  ]);
  if (timestamps.length === 0) return { min: 0, max: 1, range: 1 };
  const min = Math.min(...timestamps);
  const rawMax = Math.max(...timestamps);
  const max = rawMax > min ? rawMax : min + 1_000;
  return { min, max, range: max - min };
}

function percentAt(timestamp: number, bounds: GanttBounds): number {
  return Math.max(0, Math.min(100, ((timestamp - bounds.min) / bounds.range) * 100));
}

function formatAxisTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(timestamp);
}
