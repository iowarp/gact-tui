import { activateActivityItem, activateActivityItemFromKeyboard } from './activity-navigation';
import type {
  AsyncProcess,
  ExecutionProvenanceResult,
  Message,
  PendingInteraction,
  RunState,
  ToolInvocation,
} from '@clio/core/v3';
import {
  BotIcon,
  BoxesIcon,
  FileIcon,
  FileOutputIcon,
  FilePlusIcon,
  GitBranchPlusIcon,
  GitMergeIcon,
  MessageCircleQuestionIcon,
  MinusIcon,
  PanelRightOpenIcon,
  ScanIcon,
  SearchIcon,
  ShieldIcon,
  SquareTerminalIcon,
  WaypointsIcon,
} from 'lucide-react';
import { TOOL_OPERATIONS } from './tool-operation-contract';
import { AddIcon } from '@/lib/icon-vocabulary';
import { toolKindIcon } from '@/lib/tool-kind-icons';
import {
  createElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react';
import { Button } from '@/components/ui/button';
import { truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { flowLabel } from './flow-tool-presentation';
import { taskFlow } from './task-flow-state';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus, clioStatusLabel, type ClioStatusValue } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { compactDuration, isGenericActivitySubject } from './workbench-activity-model';
import {
  isAgentMcpInteraction,
  isCausalQuestionInteraction,
  questionInteractionRequestLabel,
} from './agent-answer-domain';
import {
  permissionActivityLabel,
  projectedActivityDetail,
  projectedActivityLabel,
  projectedFilePath,
  projectedKind,
  projectedToolName,
  permittedActionFact,
  spanToolMatcher,
} from './activity-projection-labels';
import {
  CAUSAL_ATTENTION_STATES,
  causalAttentionTone,
  causalLaneId,
  causalLanes,
  causalRows,
  formatGraphTime,
  type CausalLane,
} from './activity-causal';

export interface ObservabilityActivityItem {
  id: string;
  kind: 'run' | 'tool' | 'process' | 'artifact' | 'interaction' | 'resource';
  /** The call behind a tool or permission row; it picks the row's glyph. */
  toolName?: string;
  /** A permission decision ("Approved sbatch on ares"), drawn with a shield. */
  permission?: boolean;
  label: string;
  /** Absent when the record has no summary beyond its labeled state. */
  detail?: string;
  /** The short trailing fact: a duration or a delta ("40ms", "2.4s"). Clock time is hover-only. */
  fact?: string;
  state: RunState | ClioStatusValue;
  at?: string;
  groupId?: string;
  timing?: 'event' | 'turn';
  rootSessionId?: string;
  ownerSessionId?: string;
  ownerLabel?: string;
  parentSessionId?: string;
  taskId?: string;
  taskPath?: readonly string[];
  depth?: number;
  lifecycle?: 'open' | 'close' | 'event';
  /** Stable transcript position used when provider timestamps cannot express causality. */
  causalOrder?: number;
  causalMessageId?: string;
  transcriptMessageId?: string;
  /** Opens the durable object when its original transcript row no longer exists. */
  onActivate?: () => void;
  onOpen?: (target: SubagentOpenTarget) => void;
}

const PROJECTED_COORDINATION_TOOLS = new Set([
  'spawn_agent_task',
  'spawn_agents_parallel',
  'observe_agent_task',
  'wait_agent_tasks',
  'message_agent_task',
  'collect_agent_task',
  // A started flow is its process row (labelled as the flow's run); the tool row repeats it.
  'run_flow',
  'run_workflow',
]);

/**
 * What a background process actually reported, for the one row that stands for it.
 *
 * A row that says only "MCP task" restates the glyph beside it and hides the
 * reason a failed conversion failed. What the record carries wins; the kind is
 * the typed fallback for a record that reported nothing.
 */
// One owner for the process detail shared by the projected and unprojected timelines.
// oxlint-disable-next-line react/only-export-components
export function asyncProcessDetail(process: AsyncProcess): string {
  const reported = process.error_reason?.trim() || process.result?.answer_excerpt?.trim();
  if (reported) return truncate(reported, SUMMARY_TRUNCATE_CHARS);
  const flow = taskFlow(process);
  if (flow) return `${flowLabel(flow.id)} run`;
  if (process.kind === 'agent') return process.placement?.trim() || 'Child agent';
  return process.host?.trim() ? `Background task, ${process.host.trim()}` : 'Background task';
}

/** Project native and MCP questions and their answer route into durable Activity. */
// oxlint-disable-next-line react/only-export-components
export function agentInteractionActivityItems(
  interactions: readonly PendingInteraction[],
  processes: readonly AsyncProcess[],
  rootSessionId?: string,
): ObservabilityActivityItem[] {
  const processById = new Map(processes.map((process) => [process.id, process]));
  return interactions.filter(isCausalQuestionInteraction).map((interaction) => {
    const answerTask = interaction.payload?.agent_answer_task;
    const process = interaction.task_id ? processById.get(interaction.task_id) : undefined;
    const fallback = interaction.routing_state === 'agent_elicitation_fallback_to_human';
    const fallbackPending = fallback && interaction.status === 'pending';
    const fallbackAnswered = fallback && interaction.status === 'answered';
    const answered = interaction.status === 'answered' && interaction.answered_by === 'agent';
    const humanAddressed = !isAgentMcpInteraction(interaction);
    const humanPending = humanAddressed && interaction.status === 'pending';
    const humanAnswered = humanAddressed && interaction.status === 'answered';
    const isMcp = interaction.source.protocol === 'mcp';
    return {
      id: `question-interaction:${interaction.id}`,
      kind: 'interaction',
      label: questionInteractionRequestLabel(interaction),
      detail: fallbackPending
        ? 'Agent answer attempt ended; routed to you'
        : fallbackAnswered
          ? isMcp
            ? 'Your response was validated and returned to MCP'
            : 'Your answer resumed the agent'
          : humanPending
            ? interaction.payload?.response_mode === 'async'
              ? 'Open question; agent can continue'
              : 'Waiting for your response'
            : humanAnswered
              ? isMcp
                ? 'Your response was validated and returned to MCP'
                : 'Your answer resumed the agent'
              : answered
                ? 'Agent answer validated and returned to MCP'
                : interaction.status === 'cancelled'
                  ? 'The request was cancelled'
                  : interaction.status === 'expired'
                    ? 'The request expired'
                    : 'Agent answer turn is in progress',
      state:
        fallbackPending || humanPending
          ? 'waiting_user'
          : answered || fallbackAnswered || humanAnswered
            ? 'completed'
            : interaction.status === 'cancelled' || interaction.status === 'expired'
              ? 'cancelled'
              : answerTask?.live_state === 'queued'
                ? 'queued'
                : 'running',
      at: answerTask?.updated_at ?? interaction.created_at,
      groupId:
        process?.parent_turn_id ??
        (interaction.task_id
          ? `mcp-task:${interaction.task_id}`
          : `${interaction.source.protocol}-invocation:${interaction.source.invocation_id ?? interaction.id}`),
      timing: 'event',
      rootSessionId,
      ownerSessionId: interaction.owner_session_id,
      taskId: interaction.task_id,
      taskPath: process?.task_path,
      depth: process?.task_path?.length ?? 0,
      lifecycle: 'event',
    } satisfies ObservabilityActivityItem;
  });
}

const HIGH_SIGNAL_CHILD_KINDS = new Set([
  'tool',
  'artifact',
  'interaction',
  'interactive_work',
  'resource',
]);

/**
 * Build durable activity from CLIO's authoritative projection.
 *
 * Child ownership supplies the graph branches. Root tool spans are equally
 * important after compaction, when the visible transcript no longer carries
 * its old ToolInvocation rows. No message or reasoning content is consulted.
 */
// Pure projection helper is exported for attribution and lifecycle contract tests.
// oxlint-disable-next-line react/only-export-components
export function childProjectionActivityItems(
  provenance: ExecutionProvenanceResult,
  processes: readonly AsyncProcess[],
  knownToolIds: ReadonlySet<string> = new Set(),
  onOpenFile?: (path: string) => void,
  knownTools: readonly ToolInvocation[] = [],
): ObservabilityActivityItem[] {
  const lineage = provenance.session_lineage;
  if (!lineage) return [];
  const rootSessionId = provenance.root_session_id ?? provenance.session_id;
  const lineageBySession = new Map(lineage.map((row) => [row.session_id, row]));
  const processByTask = new Map(processes.map((process) => [process.id, process]));
  const matchTool = spanToolMatcher(knownTools);
  const items: ObservabilityActivityItem[] = [];

  for (const owner of lineage) {
    // depth 0 is the root of a delegation chain, a legal value the old `||`
    // check silently dropped alongside a genuinely missing depth.
    if (owner.depth === undefined || !owner.task_id) continue;
    const process = processByTask.get(owner.task_id);
    const state = activityState(process?.live_state ?? owner.status ?? 'running');
    const closedAt = process?.updated_at ?? owner.updated_at;
    // The close row is what carries a terminal outcome off the open row's
    // permanent "running" animation. When no close row will actually be
    // emitted, the open row must carry the true terminal state itself —
    // otherwise a failed or cancelled child reads as quietly "completed".
    const closeRowWillFollow = isTerminalState(state) && Boolean(closedAt);
    // A child named only for the agent ("CLIO") or its category says nothing as a row.
    const named = process?.title || owner.label;
    const title = named && !isGenericActivitySubject(named) ? named : undefined;
    const common = {
      kind: 'process' as const,
      label: title ?? 'Subagent started',
      rootSessionId,
      ownerSessionId: owner.session_id,
      ownerLabel: owner.label,
      parentSessionId: owner.parent_session_id,
      taskId: owner.task_id,
      taskPath: owner.task_path,
      depth: owner.depth,
    };
    items.push({
      ...common,
      id: `${owner.task_id}:branch-open`,
      detail: owner.label ? `Delegated to ${owner.label}` : 'Delegated child work',
      state: closeRowWillFollow ? 'completed' : state,
      at: process?.created_at ?? owner.created_at,
      groupId: process?.parent_turn_id,
      timing: process?.created_at || owner.created_at ? 'event' : undefined,
      lifecycle: 'open',
    });
    if (closeRowWillFollow) {
      const opened = Date.parse(process?.created_at ?? owner.created_at ?? '');
      const closed = Date.parse(closedAt ?? '');
      items.push({
        ...common,
        id: `${owner.task_id}:branch-close`,
        label: title ? `${title} returned` : 'Subagent returned',
        detail: 'Child work returned to its parent',
        fact: closed >= opened ? compactDuration(closed - opened) : undefined,
        state,
        at: closedAt,
        timing: 'event',
        lifecycle: 'close',
      });
    }
  }

  for (const process of processes) {
    if (process.kind !== 'mcp-task') continue;
    const owner = process.owner_session_id
      ? lineageBySession.get(process.owner_session_id)
      : undefined;
    items.push({
      id: `mcp-task:${process.id}`,
      kind: 'process',
      label: process.title,
      detail: asyncProcessDetail(process),
      state: process.live_state,
      at: process.updated_at ?? process.created_at,
      timing: process.updated_at || process.created_at ? 'event' : undefined,
      rootSessionId,
      ownerSessionId: process.owner_session_id,
      ownerLabel: owner?.label,
      groupId: `mcp-task:${process.id}`,
      taskId: process.id,
      taskPath: process.task_path,
      depth: owner?.depth ?? process.task_path?.length ?? 0,
      lifecycle: 'event',
    });
  }

  for (const span of provenance.spans) {
    const ownerSessionId = span.owner_session_id ?? span.session_id;
    if (!HIGH_SIGNAL_CHILD_KINDS.has(span.kind)) continue;
    // Transform records and model-step records describe trace assembly. They
    // remain available in technical provenance, but they are not extra user
    // actions. The primary graph owns one node for the real timed tool call.
    if (span.event_type === 'artifact.transform.recorded') continue;
    const toolName = projectedToolName(span.tool_name, span.label);
    if (span.kind === 'tool' && span.event_type === 'react.step.completed') continue;
    // Submission is the child's answer boundary, not a user-visible tool event.
    // Showing both the submit call and the branch join repeats the same return.
    if (span.kind === 'tool' && toolName === 'submit') continue;
    // Child coordination already has explicit branch and join nodes. Rendering
    // its transport calls as tools repeats those same causal edges.
    if (span.kind === 'tool' && toolName && PROJECTED_COORDINATION_TOOLS.has(toolName)) continue;
    if (
      span.kind === 'tool' &&
      (knownToolIds.has(span.id) ||
        Boolean(span.invocation_id && knownToolIds.has(span.invocation_id)) ||
        // Root spans carry no invocation id; the same call is already a transcript row.
        Boolean(toolName && matchTool(ownerSessionId, toolName, span.start_time, true)))
    ) {
      continue;
    }
    const owner = lineageBySession.get(ownerSessionId);
    const filePath = projectedFilePath(toolName, span.attributes);
    const permission = span.event_type === 'permission.resolved';
    const permittedTool =
      typeof span.attributes.tool_name === 'string' ? span.attributes.tool_name : undefined;
    const approvedCall =
      permission && permittedTool
        ? matchTool(ownerSessionId, permittedTool, span.start_time, false)
        : undefined;
    items.push({
      id: `projected:${span.id}`,
      kind: projectedKind(span.kind),
      toolName: permission ? permittedTool : toolName,
      permission: permission || undefined,
      label: permission
        ? permissionActivityLabel(span.label, permittedTool, approvedCall)
        : projectedActivityLabel(span.kind, toolName, span.label, span.attributes),
      detail: permission ? 'Permission' : projectedActivityDetail(span.kind),
      fact: permission
        ? permittedActionFact(provenance.spans, span, permittedTool, approvedCall)
        : span.kind === 'tool' && span.duration_ms !== null && span.duration_ms > 0
          ? compactDuration(span.duration_ms)
          : undefined,
      state: activityState(span.status),
      at: timestampString(span.end_time ?? span.start_time),
      timing: span.start_time === null && span.end_time === null ? undefined : 'event',
      rootSessionId,
      ownerSessionId,
      ownerLabel: owner?.label,
      parentSessionId: owner?.parent_session_id,
      taskId: span.task_id || owner?.task_id,
      taskPath: span.task_path?.length ? span.task_path : owner?.task_path,
      depth: owner?.depth ?? span.task_path?.length ?? 0,
      lifecycle: 'event',
      onActivate: filePath && onOpenFile ? () => onOpenFile(filePath) : undefined,
    });
  }
  return items;
}

/** Git-style causal graph with stable agent strands and transcript navigation. */
const SCROLL_FADE_PX = 24;

/** Fades only the edges a horizontal scroller continues past, read once per frame. */
function useHorizontalScrollFade(ref: RefObject<HTMLElement | null>): CSSProperties | undefined {
  const [edges, setEdges] = useState({ start: false, end: false });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const start = element.scrollLeft > 1;
        const end = element.scrollLeft + element.clientWidth < element.scrollWidth - 1;
        setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
      });
    };
    element.addEventListener('scroll', read, { passive: true });
    const observer = new ResizeObserver(read);
    const observeChildren = () => {
      observer.disconnect();
      observer.observe(element);
      for (const child of Array.from(element.children)) observer.observe(child);
      read();
    };
    observeChildren();
    const mutations = new MutationObserver(observeChildren);
    mutations.observe(element, { childList: true });
    return () => {
      element.removeEventListener('scroll', read);
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [ref]);
  if (!edges.start && !edges.end) return undefined;
  // A mask reads only alpha, so its stops are opaque/transparent, not theme colours.
  const mask = `linear-gradient(90deg, ${edges.start ? 'transparent' : 'black'}, black ${SCROLL_FADE_PX}px, black calc(100% - ${SCROLL_FADE_PX}px), ${edges.end ? 'transparent' : 'black'})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

export function ClioActivityTimeline({
  items,
  messages,
}: {
  items: readonly ObservabilityActivityItem[];
  messages: readonly Message[];
}) {
  const [zoom, setZoom] = useState(1);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const chipRow = useRef<HTMLDivElement>(null);
  const chipFade = useHorizontalScrollFade(chipRow);
  const rows = useMemo(() => causalRows(items), [items]);
  const lanes = useMemo(() => causalLanes(rows), [rows]);
  const filteredRows =
    agentFilter && lanes.some((lane) => lane.id === agentFilter)
      ? rows.filter((item) => causalLaneId(item) === agentFilter)
      : rows;
  const fitZoom = Math.max(0.5, Math.min(1, 10 / Math.max(1, lanes.length)));
  const messageIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);
  if (!rows.length) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No run or tool activity is available.
      </p>
    );
  }
  const laneSpacing = Math.round(24 * zoom);
  const graphWidth = Math.max(64, lanes.length * laneSpacing + 24);
  return (
    <section className="min-w-0" aria-label="Causal activity graph">
      <header className="flex items-center justify-between gap-2 border-b pb-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span>{lanes.length.toLocaleString()} agent strands</span>
          <span>{filteredRows.length.toLocaleString()} events</span>
        </div>
        <div
          className="flex shrink-0 items-center gap-1"
          aria-label="Causal graph zoom"
          role="group"
        >
          <Button
            aria-label="Zoom causal graph out"
            disabled={zoom <= 0.5}
            onClick={() => setZoom((value) => Math.max(0.5, value - 0.25))}
            size="icon-sm"
            variant="ghost"
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <Button
            aria-label="Zoom causal graph in"
            disabled={zoom >= 1.75}
            onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}
            size="icon-sm"
            variant="ghost"
          >
            <AddIcon aria-hidden="true" />
          </Button>
          <Button
            aria-label="Fit causal graph"
            onClick={() => setZoom(fitZoom)}
            size="icon-sm"
            variant="ghost"
          >
            <ScanIcon aria-hidden="true" />
          </Button>
        </div>
      </header>
      <div
        aria-label="Filter activity by agent"
        className="no-scrollbar flex flex-nowrap items-center gap-1 overflow-x-auto border-b py-2 [&>*]:shrink-0"
        ref={chipRow}
        role="group"
        style={chipFade}
      >
        <Button
          aria-pressed={agentFilter === null}
          onClick={() => setAgentFilter(null)}
          size="sm"
          variant={agentFilter === null ? 'secondary' : 'ghost'}
        >
          All agents
        </Button>
        {lanes.map((lane) => (
          <Button
            aria-pressed={agentFilter === lane.id}
            key={lane.id}
            onClick={() => setAgentFilter(lane.id)}
            size="sm"
            variant={agentFilter === lane.id ? 'secondary' : 'ghost'}
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: lane.color }}
            />
            {lane.label}
          </Button>
        ))}
      </div>
      <div className="min-w-0 overflow-x-auto py-1">
        <div className="w-full" style={{ minWidth: `${graphWidth + 168}px` }}>
          {filteredRows.map((item) => (
            <CausalActivityRow
              graphWidth={graphWidth}
              item={{
                ...item,
                transcriptMessageId:
                  item.transcriptMessageId ??
                  (item.groupId && messageIds.has(item.groupId) ? item.groupId : undefined),
              }}
              key={`${item.kind}:${item.id}`}
              laneSpacing={laneSpacing}
              lanes={lanes}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function CausalActivityRow({
  graphWidth,
  item,
  laneSpacing,
  lanes,
}: {
  graphWidth: number;
  item: ObservabilityActivityItem;
  laneSpacing: number;
  lanes: readonly CausalLane[];
}) {
  const lane = lanes.find((candidate) => candidate.id === causalLaneId(item)) ?? lanes[0]!;
  const parent = lanes.find((candidate) => candidate.id === item.parentSessionId) ?? lanes[0]!;
  const x = 12 + lane.index * laneSpacing;
  const parentX = 12 + parent.index * laneSpacing;
  const target = Boolean(item.transcriptMessageId || item.onActivate || item.onOpen);
  const content = (
    <div className="grid min-h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
      <div className="relative min-h-11 shrink-0 self-stretch" style={{ width: graphWidth }}>
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${graphWidth} 100`}
        >
          {lanes.map((candidate) => {
            const lineX = 12 + candidate.index * laneSpacing;
            return (
              <line
                key={candidate.id}
                style={{ stroke: candidate.color }}
                strokeOpacity="0.32"
                strokeWidth="2"
                x1={lineX}
                x2={lineX}
                y1="0"
                y2="100"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          {item.lifecycle === 'open' && lane.id !== parent.id ? (
            <path
              d={`M ${parentX} 0 C ${parentX} 35, ${x} 35, ${x} 50`}
              fill="none"
              style={{ stroke: lane.color }}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {item.lifecycle === 'close' && lane.id !== parent.id ? (
            <path
              d={`M ${x} 50 C ${x} 65, ${parentX} 65, ${parentX} 100`}
              fill="none"
              style={{ stroke: lane.color }}
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center border-2 bg-background shadow-sm',
            item.kind === 'tool' ? 'rounded-md' : 'rounded-full',
            item.lifecycle === 'open' && 'rotate-45',
          )}
          style={{ borderColor: lane.color, left: x }}
        >
          <ActivityGlyph
            className={cn('size-3', item.lifecycle === 'open' && '-rotate-45')}
            item={item}
          />
        </span>
      </div>
      <div className="min-w-0 py-2">
        <p className="flex min-w-0 items-center justify-between gap-2 text-[0.625rem] leading-3 text-muted-foreground">
          <span className="truncate" title={lane.label}>
            {lane.label}
          </span>
          <time
            className="shrink-0 tabular-nums"
            dateTime={item.at}
            title={item.timing === 'turn' ? 'Observed in its containing turn' : undefined}
          >
            {item.timing === 'turn'
              ? 'In this turn'
              : item.at
                ? formatGraphTime(item.at)
                : 'Time unavailable'}
          </time>
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{item.label}</span>
          {CAUSAL_ATTENTION_STATES.has(item.state) ? (
            <span className={cn('shrink-0 font-medium', causalAttentionTone(item.state))}>
              {clioStatusLabel(item.state)}
            </span>
          ) : null}
        </p>
        {item.detail ? (
          <p className="line-clamp-2 text-caption leading-4 text-muted-foreground">
            {item.detail}
          </p>
        ) : null}
      </div>
      <ClioStatus compact className="shrink-0" value={item.state} />
    </div>
  );
  if (!target) return <div className="border-b last:border-b-0">{content}</div>;
  return (
    <ClioInteractiveRow
      actions={
        item.onOpen ? (
          <Button
            aria-label={`Open ${item.label} in canvas`}
            onClick={() => item.onOpen?.('canvas')}
            size="icon-xs"
            title="Open in canvas"
            type="button"
            variant="ghost"
          >
            <PanelRightOpenIcon aria-hidden="true" />
          </Button>
        ) : undefined
      }
      aria-label={`Open transcript event ${item.label}`}
      className="min-h-0 border-b px-0 py-0 last:border-b-0"
      onClick={(event) => activateActivityItem(item, event)}
      onKeyDown={(event) => activateActivityItemFromKeyboard(item, event)}
      role="button"
    >
      {content}
    </ClioInteractiveRow>
  );
}

export function ActivityGlyph({
  item,
  className,
}: {
  item: ObservabilityActivityItem;
  className: string;
}) {
  const props = { 'aria-hidden': true as const, className };
  if (item.lifecycle === 'open') return <GitBranchPlusIcon {...props} />;
  if (item.lifecycle === 'close') return <GitMergeIcon {...props} />;
  if (item.permission) return <ShieldIcon {...props} />;
  if (item.kind === 'tool') {
    // The spec draws the action, not the category: a file read, an edit, a search, a command.
    const name = item.toolName?.split(/[.:/]/u).pop() ?? '';
    if (/read_file$|^read$|^view$/u.test(name)) return <FileIcon {...props} />;
    if (/(?:write|edit|create)_file$|^(?:write|edit|apply_patch)$/u.test(name))
      return <FilePlusIcon {...props} />;
    if (item.toolName && TOOL_OPERATIONS[item.toolName]?.family === 'search')
      return <SearchIcon {...props} />;
    if (/(?:^|_)(?:bash|shell|command|exec|run_code)(?:$|_)/u.test(name))
      return <SquareTerminalIcon {...props} />;
    return createElement(toolKindIcon(name), props);
  }
  if (item.kind === 'process') return <BoxesIcon {...props} />;
  if (item.kind === 'artifact') return <FileOutputIcon {...props} />;
  if (item.kind === 'interaction') return <MessageCircleQuestionIcon {...props} />;
  if (item.kind === 'resource') return <WaypointsIcon {...props} />;
  return <BotIcon {...props} />;
}

function timestampString(value: number | null): string | undefined {
  if (value === null || !Number.isFinite(value)) return undefined;
  return new Date(value * 1_000).toISOString();
}

function isTerminalState(state: ClioStatusValue): boolean {
  return ['completed', 'failed', 'cancelled', 'interrupted', 'succeeded', 'denied'].includes(state);
}

function activityState(value: string): ClioStatusValue {
  if (value === 'success' || value === 'succeeded' || value === 'finished') return 'completed';
  if (value === 'error') return 'failed';
  if (
    [
      'queued',
      'running',
      'waiting_permission',
      'waiting_user',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
      'pending',
      'denied',
      'healthy',
      'degraded',
      'unavailable',
      'unknown',
    ].includes(value)
  ) {
    return value as ClioStatusValue;
  }
  return 'unknown';
}
