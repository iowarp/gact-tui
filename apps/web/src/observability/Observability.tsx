import { useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Chip, Eyebrow, Icon, Select, Tabs, type TabDef } from '../kit';
import type {
  ObsContext,
  ObsNavigation,
  ObsRun,
  ObsSpan,
  ObsTimelineKind,
  ObsToolCallRow,
  ObservabilityData,
} from './types';
import './observability.css';

export interface ObservabilityProps {
  data: ObservabilityData;
  /** Layer owners render the trace state in their shared header row. */
  showTraceHeader?: boolean;
  /** Tab to land on when the layer opens — the pill chips deep-link here. */
  initialTab?: ObsTab;
  /** Timeline/gantt/runs/tools row click-through — the prototype's `r.go`
   *  (jump to message / open agent). Omitted rows render inert, matching the
   *  prototype's own `cursor:default` for rows with no real target. */
  onNavigate?: (nav: ObsNavigation) => void;
}

export type ObsTab = 'agents' | 'timeline' | 'runs' | 'tools' | 'artifacts' | 'context';
type TimelineMode = 'log' | 'gantt';

/** Legend-only glyphs — the prototype's compact legend iconography is
 *  deliberately simpler than the row markers themselves (design/prototype
 *  Clio Session.html ~8239011): plain characters for event/artifact/
 *  failure/running, a tiny bordered wrench circle for tool. */
const LEGEND_CHAR: Partial<Record<ObsTimelineKind, string>> = {
  event: '○',
  artifact: '◆',
  failure: '✗',
  running: '●',
};
const LEGEND_KINDS: ObsTimelineKind[] = ['event', 'tool', 'artifact', 'failure', 'running'];

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
export function Observability({
  data,
  showTraceHeader = true,
  initialTab,
  onNavigate,
}: ObservabilityProps) {
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
  const toolCalls = data.toolCalls ?? [];
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
        // The badge counts real CALLS made this session (obsToolRows.length in
        // the prototype), not the catalog's declared tool count — the two
        // numbers mean different things and only one matches what the tab shows.
        { id: 'tools', label: 'tools', badge: toolCalls.length },
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
      toolCalls.length === 0 &&
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
            {...(onNavigate ? { onNavigate } : {})}
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
          legacy ? (
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
          ) : (
            <RunsTab runs={data.runs} {...(onNavigate ? { onNavigate } : {})} />
          )
        ) : null}

        {activeTab === 'tools' ? (
          legacy ? (
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
          ) : (
            <ToolLog rows={toolCalls} {...(onNavigate ? { onNavigate } : {})} />
          )
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
                  {/* No artifact viewer is reachable anywhere in this build yet
                      (tracked separately — "mint real artifacts and ground the
                      chips"); the row is still a real button, matching the
                      prototype's structure, honestly disabled rather than a
                      dead-looking static row. */}
                  <button
                    type="button"
                    className="obs-artifact__button"
                    disabled
                    data-unbacked="true"
                    title="Artifact viewer not wired yet"
                  >
                    <time className="obs-artifact__time">{artifact.at}</time>
                    <span className="obs-artifact__glyph" aria-hidden="true">
                      ◆
                    </span>
                    <span className="obs-artifact__name">{artifact.name}</span>
                    <span className="obs-artifact__producer">· {artifact.producer}</span>
                    <span className="obs-artifact__meta">{artifact.meta}</span>
                  </button>
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

// ---- runs tab (P5): RUNNING / COMPLETED (N) / FAILED, grouped ----

/** Non-terminal run states — anything else counts as "live now"/"running".
 *  Mirrors SessionView's TERMINAL_AGENT_TASK_STATUSES; kept local since
 *  ObsRun.state is a display string, not the raw wire enum SessionView
 *  normalizes. 'succeeded' is a real terminal value some task projections
 *  use that the original set missed. */
const TERMINAL_RUN_STATES = new Set([
  'completed',
  'failed',
  'cancelled',
  'canceled',
  'detached',
  'done',
  'error',
  'succeeded',
]);
const FAILED_RUN_STATES = new Set(['failed', 'error', 'cancelled', 'canceled']);

function classifyRun(run: ObsRun): 'running' | 'completed' | 'failed' {
  const state = run.state.toLowerCase();
  if (!TERMINAL_RUN_STATES.has(state)) return 'running';
  return FAILED_RUN_STATES.has(state) ? 'failed' : 'completed';
}

interface RunsTabProps {
  runs: ObsRun[];
  onNavigate?: (nav: ObsNavigation) => void;
}

/** Prototype markup (~8250004): three uppercase-labelled sections — running
 *  (orange bolt), completed (N) (green check), failed (red x) — each row a
 *  full-width button naming the run, its host, a status line, a description
 *  line, and a transcript action. */
function RunsTab({ runs, onNavigate }: RunsTabProps) {
  if (runs.length === 0) {
    return (
      <p className="obs__empty" data-testid="obs-empty">
        no trace recorded for this session
      </p>
    );
  }
  const running = runs.filter((run) => classifyRun(run) === 'running');
  const completed = runs.filter((run) => classifyRun(run) === 'completed');
  const failed = runs.filter((run) => classifyRun(run) === 'failed');

  return (
    <div className="obs-runs2" data-testid="obs-runs">
      {running.length > 0 ? (
        <RunGroup
          title="running"
          tone="running"
          runs={running}
          actionLabel="live transcript"
          navTitle="Open the live view for this run"
          {...(onNavigate ? { onNavigate } : {})}
        />
      ) : null}
      {completed.length > 0 ? (
        <RunGroup
          title={`completed (${completed.length})`}
          tone="completed"
          runs={completed}
          actionLabel="transcript"
          navTitle="Open this run's transcript"
          {...(onNavigate ? { onNavigate } : {})}
        />
      ) : null}
      {failed.length > 0 ? (
        <RunGroup
          title="failed"
          tone="failed"
          runs={failed}
          actionLabel="transcript"
          navTitle="Open the failure log"
          {...(onNavigate ? { onNavigate } : {})}
        />
      ) : null}
    </div>
  );
}

interface RunGroupProps {
  title: string;
  tone: 'running' | 'completed' | 'failed';
  runs: ObsRun[];
  actionLabel: string;
  navTitle: string;
  onNavigate?: (nav: ObsNavigation) => void;
}

function RunGroup({ title, tone, runs, actionLabel, navTitle, onNavigate }: RunGroupProps) {
  return (
    <div className="obs-rungroup" data-tone={tone}>
      <div className="obs-rungroup__title">{title}</div>
      <ul className="obs-rungroup__list">
        {runs.map((run) => {
          const clickable = Boolean(run.nav && onNavigate);
          return (
            <li key={run.id}>
              <button
                type="button"
                className="obs-run2__row"
                data-tone={tone}
                disabled={!clickable}
                title={clickable ? navTitle : 'No transcript available for this run'}
                onClick={clickable ? () => onNavigate!(run.nav!) : undefined}
              >
                <span className="obs-run2__icon" aria-hidden="true">
                  {tone === 'running' ? (
                    <Icon name="bolt" size={11} />
                  ) : tone === 'completed' ? (
                    '✓'
                  ) : (
                    '✗'
                  )}
                </span>
                <span className="obs-run2__identity">
                  <span className="obs-run2__name">{run.label ?? run.id}</span>
                  {run.host ? <span className="obs-run2__host">{run.host}</span> : null}
                </span>
                <span className="obs-run2__status">{run.duration ?? run.state}</span>
                <span className="obs-run2__desc">{run.description ?? ''}</span>
                <span className="obs-run2__act">{clickable ? `${actionLabel} ↗` : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---- tools tab (P5): chronological call log ----

interface ToolLogProps {
  rows: ObsToolCallRow[];
  onNavigate?: (nav: ObsNavigation) => void;
}

/** Prototype markup (`obsToolRows`, ~8256494): one row per real tool call —
 *  time, orange wrench, an expandable `name(argHint) ▸` toggle, an agent tag,
 *  a trailing status glyph. Replaces the static per-server catalog: this tab
 *  is a LOG of what was actually called, not a directory of what could be. */
function ToolLog({ rows, onNavigate }: ToolLogProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (rows.length === 0) {
    return (
      <p className="obs__empty" data-testid="obs-empty">
        no tool calls recorded for this session
      </p>
    );
  }

  const toggle = (id: string) =>
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ol className="obs-toollog" data-testid="obs-tools">
      {rows.map((row) => {
        const isOpen = expanded.has(row.sourceId);
        const canJump = Boolean(row.nav && onNavigate);
        return (
          <li className="obs-toollog__row" key={row.sourceId} data-state={row.state}>
            <time className="obs-toollog__time">{row.at ?? ''}</time>
            <span className="obs-toollog__glyph" aria-hidden="true">
              <Icon name="wrench" size={11} />
            </span>
            <button
              type="button"
              className="obs-toollog__toggle"
              aria-expanded={isOpen}
              onClick={() => toggle(row.sourceId)}
            >
              <span className="obs-toollog__name">{row.name}</span>
              {row.argHint ? <span className="obs-toollog__arghint">({row.argHint})</span> : null}
              <span className="obs-toollog__caret" aria-hidden="true">
                {isOpen ? '▾' : '▸'}
              </span>
            </button>
            <button
              type="button"
              className="obs-toollog__agent"
              disabled={!canJump}
              title={canJump ? 'Go to message' : undefined}
              onClick={canJump ? () => onNavigate!(row.nav!) : undefined}
            >
              {row.agent} {canJump ? '↗' : null}
            </button>
            <span className="obs-toollog__status" data-state={row.state} aria-hidden="true">
              {row.state === 'done' ? '✓' : row.state === 'failed' ? '✗' : '●'}
            </span>
            {isOpen ? (
              <div className="obs-toollog__detail">
                {row.duration ? `duration ${row.duration}` : 'no further detail recorded'}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

// ---- context tab ----

/** Non-terminal run states — anything else counts as "live now". Reuses the
 *  same terminal vocabulary the runs tab groups by, so "live now" always
 *  agrees with what the runs tab itself calls running. */
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
  const liveRuns = runs.filter((run) => classifyRun(run) === 'running');
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

// ---- timeline (log + gantt) ----

interface TimelineProps {
  rows: NonNullable<ObservabilityData['timeline']>;
  spans: NonNullable<ObservabilityData['spans']>;
  mode: TimelineMode;
  onModeChange: (mode: TimelineMode) => void;
  onNavigate?: (nav: ObsNavigation) => void;
}

/** Attributes for a row that may or may not be clickable — the prototype's
 *  `cursor:{{r.cur}}` (pointer when a real target exists, default otherwise)
 *  plus real keyboard activation for whatever click handler this authors. */
function navProps(nav: ObsNavigation | undefined, onNavigate: ((nav: ObsNavigation) => void) | undefined) {
  if (!nav || !onNavigate) return { 'data-nav': 'false' as const };
  return {
    role: 'button' as const,
    tabIndex: 0,
    'data-nav': 'true' as const,
    onClick: () => onNavigate(nav),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onNavigate(nav);
      }
    },
  };
}

function Timeline({ rows, spans, mode, onModeChange, onNavigate }: TimelineProps) {
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
          {LEGEND_KINDS.map((kind) => (
            <span className="obs-legend__item" data-kind={kind} key={kind}>
              <span className="obs-legend__glyph" aria-hidden="true">
                {kind === 'tool' ? <Icon name="wrench" size={6} /> : LEGEND_CHAR[kind]}
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
                {...navProps(row.nav, onNavigate)}
              >
                <span className="obs-log__thread" aria-hidden="true">
                  <LogNode kind={row.kind} />
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
        <Gantt spans={spans} {...(onNavigate ? { onNavigate } : {})} />
      ) : (
        <p className="obs__empty" data-testid="obs-empty">
          no trace recorded for this session
        </p>
      )}
    </div>
  );
}

/** The prototype's per-row marker chain (~8244025): a plain ring for generic
 *  events, an 8x8 diamond for artifacts, a bold ✗ for failures, a pulsing
 *  filled dot for running, and 16x16 icon-in-circle badges for user/tool —
 *  six distinct shapes, not one flat character set. */
function LogNode({ kind }: { kind: ObsTimelineKind }) {
  if (kind === 'failure') {
    return (
      <span className="obs-log__node" data-shape="x" aria-hidden="true">
        ✗
      </span>
    );
  }
  if (kind === 'user') {
    return (
      <span className="obs-log__node" data-shape="badge" data-kind="user" aria-hidden="true">
        <Icon name="person" size={9} />
      </span>
    );
  }
  if (kind === 'tool') {
    return (
      <span className="obs-log__node" data-shape="badge" data-kind="tool" aria-hidden="true">
        <Icon name="wrench" size={9} />
      </span>
    );
  }
  const shape = kind === 'artifact' ? 'diamond' : kind === 'running' ? 'dot' : 'ring';
  return <span className="obs-log__node" data-shape={shape} aria-hidden="true" />;
}

interface GanttProps {
  spans: ObsSpan[];
  onNavigate?: (nav: ObsNavigation) => void;
}

function Gantt({ spans, onNavigate }: GanttProps) {
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
          <div
            className="obs-gantt__row"
            data-depth={span.depth}
            key={span.id}
            {...navProps(span.nav, onNavigate)}
          >
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
