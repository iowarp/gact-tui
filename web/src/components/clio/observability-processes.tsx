import type {
  AsyncProcess,
  ExecutionProvenanceResult,
  ExecutionProvenanceSpan,
  Message,
  Run,
  SubagentRun,
  ToolInvocation,
} from '@clio/core/v3';
import { Clock3Icon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Gantt } from '@/components/reui/gantt/gantt';
import { GanttNav, GanttTitle } from '@/components/reui/gantt/gantt-nav';
import type {
  GanttEvent,
  GanttOccurrence,
  GanttResource,
} from '@/components/reui/gantt/gantt-types';
import { GanttView } from '@/components/reui/gantt/gantt-view';
import type { SubagentOpenTarget } from './subagent-card';
import { ClioStatus, type ClioStatusValue } from './status';
import { getToolActivityTitle, getToolStatus, humanizeToolName } from './tool-presentation';
import { provenanceFileFact } from './session-evidence-projection';

const BRANCH_COLORS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

interface ClioProcessLanesProps {
  executionProvenance?: ExecutionProvenanceResult;
  messages?: readonly Message[];
  processes: readonly AsyncProcess[];
  runs?: readonly Run[];
  subagents?: readonly SubagentRun[];
  tools?: readonly ToolInvocation[];
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void;
}

/** Hierarchical execution Gantt composed from the ReUI Gantt primitive. */
export function ClioProcessLanes({
  executionProvenance,
  messages = [],
  processes,
  runs = [],
  subagents = [],
  tools = [],
  onOpenSubagent,
}: ClioProcessLanesProps) {
  const recordedSpans = useMemo(
    () => executionSpans({ executionProvenance, messages, processes, runs, tools }),
    [executionProvenance, messages, processes, runs, tools],
  );
  const spans = useMemo(() => latestExecutionSpans(recordedSpans), [recordedSpans]);
  const branches = useMemo(() => branchPalette(spans), [spans]);
  const lanes = useMemo(() => executionLanes(spans, branches), [branches, spans]);
  const [now, setNow] = useState(() => Date.now());

  const hasRunning = spans.some((span) => span.end === null);
  useEffect(() => {
    if (!hasRunning) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [hasRunning]);

  const extent = useMemo(() => fullExtent(spans, now), [now, spans]);
  const model = useMemo(() => executionGantt(lanes, now), [lanes, now]);
  const center = useMemo(() => new Date((extent.start + extent.end) / 2), [extent]);
  const initialZoom = useMemo(() => executionZoom(extent), [extent]);
  const ganttKey = useMemo(
    () => spans.map((span) => `${span.id}:${span.start}:${span.end ?? 'running'}`).join('|'),
    [spans],
  );
  const [zoomState, setZoomState] = useState(() => ({ key: ganttKey, value: initialZoom }));
  const zoom = zoomState.key === ganttKey ? zoomState.value : initialZoom;
  const height = Math.min(560, Math.max(280, 112 + resourceRowCount(model.resources) * 40));

  if (!lanes.length) {
    return (
      <p className="rounded-lg border border-dashed p-5 text-center text-sm text-muted-foreground">
        No execution timing was recorded for this session.
      </p>
    );
  }

  return (
    <div
      aria-label="Observed execution spans"
      className="min-h-0 overflow-hidden rounded-lg border bg-background"
      role="region"
    >
      <Gantt<ExecutionGanttData>
        barLabel="auto"
        baselineBars={false}
        className="w-full"
        defaultDate={center}
        defaultInteractions={{ drag: false, resize: false, selectSlot: false }}
        defaultScale="day"
        dependencyLines
        events={model.events}
        infiniteScroll={false}
        initialCenter={center}
        interval={15}
        i18n={{ formats: { eventTime: 'h:mm:ss a' } }}
        key={ganttKey}
        metrics={{
          autoLabelMin: 4.5,
          laneHeight: 1.5,
          minRowHeight: 2.25,
          rowPadding: 0.375,
          unitWidths: { day: 2.5 },
        }}
        nowIndicator={hasRunning}
        offDays={false}
        offscreenIndicators
        onEventClick={(occurrence, event) =>
          openGanttSubagent(occurrence, event.shiftKey, subagents, onOpenSubagent)
        }
        onZoomChange={(value) => setZoomState({ key: ganttKey, value })}
        resources={model.resources}
        rowCheckboxes={false}
        scheduleMode="single"
        summaryBars
        timelineLines="both"
        treePanel={{ maxWidth: 360, minWidth: 150, nameColumnWidth: 200, width: 220 }}
        wheelZoom
        zoom={zoom}
        zoomRange={{ max: 256, min: 0.02, step: Math.max(0.25, initialZoom / 8) }}
        style={{ height }}
      >
        <GanttNav className="py-1.5">
          <GanttTitle>{`Execution · ${formatWindow(extent)}`}</GanttTitle>
        </GanttNav>
        <GanttView />
      </Gantt>
    </div>
  );
}

interface ExecutionGanttData {
  span: ProcessSpan;
}

interface ExecutionGanttModel {
  events: GanttEvent<ExecutionGanttData>[];
  resources: GanttResource[];
}

function executionGantt(lanes: readonly ProcessLane[], now: number): ExecutionGanttModel {
  const laneResourceIds = new Map(lanes.map((lane) => [lane.id, `lane:${lane.id}`]));
  const byOwner = groupLanesByOwner(lanes);
  const resources = [...byOwner.entries()].map(([owner, ownerLanes]) => {
    const work = ownerLanes.filter((lane) => lane.kind !== 'tool');
    const tools = ownerLanes.filter((lane) => lane.kind === 'tool');
    const children: GanttResource[] = [];
    if (work.length) children.push(ganttLaneGroup(`${owner}:work`, 'Agent work', work, laneResourceIds));
    if (tools.length)
      children.push(ganttLaneGroup(`${owner}:tools`, 'Tool calls', tools, laneResourceIds));
    const ownerLabel =
      owner === 'main'
        ? 'Main agent'
        : (work.find((lane) => lane.kind === 'agent' || lane.kind === 'mcp-task')?.label ??
          'Background work');
    return { id: `owner:${owner}`, title: ownerLabel, children };
  });
  const dependencyIds = ganttDependencies(lanes);
  const events = lanes.flatMap((lane) =>
    lane.spans.map(
      (span): GanttEvent<ExecutionGanttData> => ({
        id: `event:${span.id}`,
        title: span.label,
        start: new Date(span.start),
        end: new Date(span.end ?? now),
        color: lane.color,
        data: { span },
        dependencies: dependencyIds.get(span.id),
        progress: span.state === 'done' ? 100 : undefined,
        readOnly: true,
        resourceId: laneResourceIds.get(lane.id),
      }),
    ),
  );
  return { events, resources };
}

function ganttLaneGroup(
  id: string,
  title: string,
  lanes: readonly ProcessLane[],
  resourceIds: ReadonlyMap<string, string>,
): GanttResource {
  return {
    id: `group:${id}`,
    title,
    children: lanes.map((lane) => ({
      id: resourceIds.get(lane.id)!,
      title: lane.label,
      color: lane.color,
      scheduleMode: 'single',
    })),
  };
}

function ganttDependencies(lanes: readonly ProcessLane[]): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();
  const toolsByOwner = new Map<string, ProcessSpan[]>();
  for (const span of lanes.filter((lane) => lane.kind === 'tool').flatMap((lane) => lane.spans)) {
    const bucket = toolsByOwner.get(span.owner);
    if (bucket) bucket.push(span);
    else toolsByOwner.set(span.owner, [span]);
  }
  for (const spans of toolsByOwner.values()) {
    const ordered = [...spans].sort((left, right) => left.start - right.start);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]!;
      const current = ordered[index]!;
      if (previous.end !== null && previous.end <= current.start) {
        dependencies.set(current.id, [`event:${previous.id}`]);
      }
    }
  }
  return dependencies;
}

function openGanttSubagent(
  occurrence: GanttOccurrence<ExecutionGanttData>,
  openCanvas: boolean,
  subagents: readonly SubagentRun[],
  onOpenSubagent?: (subagent: SubagentRun, target: SubagentOpenTarget) => void,
) {
  const subagentId = occurrence.event.data?.span.subagentId;
  const subagent = subagents.find((candidate) => candidate.id === subagentId);
  if (subagent?.child_session_id) {
    onOpenSubagent?.(subagent, openCanvas ? 'canvas' : 'conversation');
  }
}

function resourceRowCount(resources: readonly GanttResource[]): number {
  return resources.reduce(
    (count, resource) => count + 1 + resourceRowCount(resource.children ?? []),
    0,
  );
}

function groupLanesByOwner(lanes: readonly ProcessLane[]): Map<string, ProcessLane[]> {
  const grouped = new Map<string, ProcessLane[]>();
  for (const lane of lanes) {
    const bucket = grouped.get(lane.owner);
    if (bucket) bucket.push(lane);
    else grouped.set(lane.owner, [lane]);
  }
  return grouped;
}

function executionZoom(range: TimeRange): number {
  const durationMinutes = Math.max(0.25, (range.end - range.start) / 60_000);
  return Math.min(256, Math.max(0.02, 60 / durationMinutes));
}

/**
 * What to call a process on a timeline row.
 *
 * Never its id. A task token is an opaque correlation handle, not a name: it
 * tells the reader nothing about what is running, and the row is the only place
 * they can find out. The token stays on the span as `data-execution-span-id`
 * for anyone matching a row to a trace.
 */
function processLabel(process: AsyncProcess): string {
  return process.title.trim() || (process.kind === 'agent' ? 'Agent task' : 'MCP task');
}

interface ProcessSpan {
  id: string;
  label: string;
  laneLabel?: string;
  branch: string;
  owner: string;
  kind: ProcessLane['kind'];
  start: number;
  end: number | null;
  state: 'done' | 'running' | 'failed';
  status: ClioStatusValue;
  timing: 'exact' | 'observed';
  subagentId?: string;
  depth: number;
}

interface ProcessLane {
  id: string;
  label: string;
  color: string;
  kind: 'main' | AsyncProcess['kind'] | 'tool';
  owner: string;
  depth: number;
  spans: ProcessSpan[];
}

interface TimeRange {
  start: number;
  end: number;
}

function executionSpans({
  executionProvenance,
  messages,
  processes,
  runs,
  tools,
}: {
  executionProvenance?: ExecutionProvenanceResult;
  messages: readonly Message[];
  processes: readonly AsyncProcess[];
  runs: readonly Run[];
  tools: readonly ToolInvocation[];
}): ProcessSpan[] {
  const processLabels = qualifiedProcessLabels(processes);
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
          depth: process.task_path?.length ?? process.depth ?? (process.kind === 'agent' ? 1 : 0),
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
        label: processLabels.get(process.id) ?? processLabel(process),
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
        depth: process.task_path?.length ?? process.depth ?? (process.kind === 'agent' ? 1 : 0),
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
  const hasDurableTurns = Boolean(
    executionProvenance?.spans.some((span) => span.event_type === 'turn.started'),
  );
  const messageSpans = runSpans.length || hasDurableTurns
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
        label: getToolActivityTitle(tool),
        branch: `${owner}:tool:${tool.name}`,
        owner,
        kind: 'tool',
        start,
        end: running ? null : exact ? Math.max(start, exactEnd ?? start) : start,
        state: getToolStatus(tool) === 'failed' ? 'failed' : running ? 'running' : 'done',
        status: getToolStatus(tool),
        timing: exact ? 'exact' : 'observed',
        depth: processOwner ? processOwner.depth + 1 : 1,
      };
    })
    .filter((span): span is ProcessSpan => span !== undefined);
  const durableSpans = durableExecutionSpans(executionProvenance, tools, runs);
  return [...runSpans, ...messageSpans, ...processSpans, ...toolSpans, ...durableSpans].sort(
    (left, right) => left.start - right.start,
  );
}

/**
 * Gantt is the current work breakdown, while Timeline owns the full session chronology.
 * Prefer the latest durable root run; imported histories without runs fall back to the
 * latest activity cluster and exclude long idle gaps between unrelated turns.
 */
function latestExecutionSpans(spans: readonly ProcessSpan[]): ProcessSpan[] {
  const latestRoot = spans.findLast((span) => span.kind === 'main' && span.timing === 'exact');
  if (latestRoot) {
    const end = latestRoot.end ?? Number.POSITIVE_INFINITY;
    return spans.filter(
      (span) =>
        span === latestRoot ||
        (span.start >= latestRoot.start - 1_000 && span.start <= end + 1_000),
    );
  }
  const ordered = [...spans].sort((left, right) => left.start - right.start);
  if (ordered.length < 2) return ordered;
  let first = ordered.length - 1;
  for (let index = ordered.length - 2; index >= 0; index--) {
    const previous = ordered[index]!;
    const next = ordered[index + 1]!;
    if (next.start - (previous.end ?? previous.start) > 5 * 60_000) break;
    first = index;
  }
  return ordered.slice(first);
}

/** Retain exact root timing when compaction removes old transcript entities. */
function durableExecutionSpans(
  provenance: ExecutionProvenanceResult | undefined,
  tools: readonly ToolInvocation[],
  runs: readonly Run[],
): ProcessSpan[] {
  if (!provenance) return [];
  const rootSessionId = provenance.root_session_id ?? provenance.session_id;
  const knownToolIds = new Set(tools.map((tool) => tool.id));
  const turnRows = runs.length
    ? []
    : provenance.spans.filter(
        (span) =>
          span.owner_session_id === rootSessionId &&
          span.event_type === 'turn.started' &&
          span.start_time !== null,
      );
  const toolRows = provenance.spans.filter(
    (span) =>
      span.event_type === 'tool.call.started' &&
      span.start_time !== null &&
      !(span.invocation_id && knownToolIds.has(span.invocation_id)) &&
      !matchesRecordedTool(span, tools),
  );
  return [
    ...turnRows.map((span, index): ProcessSpan => ({
      id: `provenance:${span.id}`,
      label: `Main agent, turn ${index + 1}`,
      branch: 'main',
      owner: 'main',
      kind: 'main',
      start: span.start_time! * 1_000,
      end: span.end_time === null ? null : Math.max(span.start_time!, span.end_time) * 1_000,
      state: provenanceSpanState(span),
      status: provenanceSpanStatus(span),
      timing: 'exact',
      depth: 0,
    })),
    ...toolRows.map((span): ProcessSpan => {
      const owner =
        !span.owner_session_id || span.owner_session_id === rootSessionId
          ? 'main'
          : span.owner_session_id;
      const label = provenanceToolLabel(span);
      return {
        id: `provenance:${span.id}`,
        label,
        laneLabel: span.tool_name === 'fs_read_file' ? 'Read files' : operationLabel(span),
        branch: `${owner}:tool:${span.tool_name ?? span.id}`,
        owner,
        kind: 'tool',
        start: span.start_time! * 1_000,
        end: span.end_time === null ? null : Math.max(span.start_time!, span.end_time) * 1_000,
        state: provenanceSpanState(span),
        status: provenanceSpanStatus(span),
        timing: 'exact',
        depth: owner === 'main' ? 1 : (span.task_path?.length ?? 1) + 1,
      };
    }),
  ];
}

function matchesRecordedTool(
  span: ExecutionProvenanceSpan,
  tools: readonly ToolInvocation[],
): boolean {
  const startedAt = span.start_time === null ? undefined : span.start_time * 1_000;
  return tools.some((tool) => {
    if (tool.name !== span.tool_name || tool.session_id !== span.owner_session_id) return false;
    const toolStartedAt = parseTimestamp(tool.started_at);
    return startedAt !== undefined && toolStartedAt !== undefined
      ? Math.abs(startedAt - toolStartedAt) < 2_000
      : false;
  });
}

function provenanceToolLabel(span: ExecutionProvenanceSpan): string {
  const input = span.attributes.tool_input;
  const qualifier =
    input && typeof input === 'object'
      ? ['filepath', 'path', 'uri', 'resource_id', 'task_id']
          .map((key) => (input as Record<string, unknown>)[key])
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined;
  const operation = span.tool_name
    ? (provenanceFileFact(span.tool_name) ?? humanizeToolName(span.tool_name))
    : span.label;
  if (!qualifier) return operation;
  const compact = qualifier.split(/[\\/]/u).filter(Boolean).at(-1) ?? qualifier;
  return `${operation} ${compact}`;
}

function operationLabel(span: ExecutionProvenanceSpan): string {
  return span.tool_name
    ? (provenanceFileFact(span.tool_name) ?? humanizeToolName(span.tool_name))
    : span.label;
}

function provenanceSpanStatus(span: ExecutionProvenanceSpan): ClioStatusValue {
  if (span.status === 'success' || span.status === 'succeeded') return 'completed';
  if (span.status === 'error') return 'failed';
  return span.status as ClioStatusValue;
}

function provenanceSpanState(span: ExecutionProvenanceSpan): ProcessSpan['state'] {
  const status = provenanceSpanStatus(span);
  if (status === 'failed' || status === 'denied') return 'failed';
  return span.end_time === null ? 'running' : 'done';
}

function qualifiedProcessLabels(processes: readonly AsyncProcess[]): Map<string, string> {
  const ordered = [...processes].sort((left, right) =>
    (left.created_at ?? '').localeCompare(right.created_at ?? ''),
  );
  const totals = new Map<string, number>();
  for (const process of ordered) {
    const label = processLabel(process);
    totals.set(label, (totals.get(label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return new Map(
    ordered.map((process) => {
      const label = processLabel(process);
      const occurrence = (seen.get(label) ?? 0) + 1;
      seen.set(label, occurrence);
      return [process.id, (totals.get(label) ?? 0) > 1 ? `${label}, turn ${occurrence}` : label];
    }),
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
              : (lane[0]!.laneLabel ?? lane[0]!.label),
        color: colors.get(branch) ?? BRANCH_COLORS[0]!,
        kind: lane[0]!.kind,
        owner: lane[0]!.owner,
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
