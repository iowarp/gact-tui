import type {
  AsyncProcess,
  ExecutionProvenanceResult,
  Message,
  PendingInteraction,
  RunState,
} from '@clio/core/v3';
import {
  BotIcon,
  BoxesIcon,
  FileOutputIcon,
  GitBranchPlusIcon,
  GitMergeIcon,
  MessageCircleQuestionIcon,
  PanelRightOpenIcon,
  WaypointsIcon,
  WrenchIcon,
  MinusIcon,
  PlusIcon,
  ScanIcon,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus, type ClioStatusValue } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { humanizeToolName } from './tool-presentation';
import {
  isAgentMcpInteraction,
  isCausalQuestionInteraction,
  questionInteractionRequestLabel,
} from './agent-answer-domain';
import { provenanceFileFact } from './session-evidence-projection';

export interface ObservabilityActivityItem {
  id: string;
  kind: 'run' | 'tool' | 'process' | 'artifact' | 'interaction' | 'resource';
  label: string;
  /** Absent when the record has no summary beyond its labeled state. */
  detail?: string;
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

const CAUSAL_COLORS = ['#22d3ee', '#60a5fa', '#a78bfa', '#34d399', '#fb7185', '#facc15'];

const PROJECTED_COORDINATION_TOOLS = new Set([
  'spawn_agent_task',
  'spawn_agents_parallel',
  'observe_agent_task',
  'wait_agent_tasks',
  'message_agent_task',
  'collect_agent_task',
]);

interface CausalLane {
  id: string;
  label: string;
  color: string;
  index: number;
}

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
            ? 'Waiting for your response'
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

const COMMISSION_ACTIVITY = {
  'blueprint.commission.started': {
    detail: 'Commissioned blueprint',
    kind: 'process',
  },
  'blueprint.commission.artifact_returned': {
    detail: 'Registered report returned',
    kind: 'artifact',
  },
  'blueprint.commission.parent_used_artifact': {
    detail: 'Parent used returned report',
    kind: 'artifact',
  },
} as const satisfies Record<string, { detail: string; kind: ObservabilityActivityItem['kind'] }>;

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
): ObservabilityActivityItem[] {
  const lineage = provenance.session_lineage;
  if (!lineage) return [];
  const rootSessionId = provenance.root_session_id ?? provenance.session_id;
  const lineageBySession = new Map(lineage.map((row) => [row.session_id, row]));
  const processByTask = new Map(processes.map((process) => [process.id, process]));
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
    const common = {
      kind: 'process' as const,
      label: process?.title || owner.label || 'Untitled task',
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
      items.push({
        ...common,
        id: `${owner.task_id}:branch-close`,
        detail: 'Child work returned to its parent',
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
    const commission = COMMISSION_ACTIVITY[span.event_type as keyof typeof COMMISSION_ACTIVITY];
    if (commission) {
      const owner = lineageBySession.get(ownerSessionId);
      const turnId =
        typeof span.attributes.turn_id === 'string' ? span.attributes.turn_id : undefined;
      items.push({
        id: `projected:${span.id}`,
        kind: commission.kind,
        label: span.label,
        detail: commission.detail,
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
        groupId: turnId,
        lifecycle: 'event',
      });
      continue;
    }
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
        Boolean(span.invocation_id && knownToolIds.has(span.invocation_id)))
    ) {
      continue;
    }
    const owner = lineageBySession.get(ownerSessionId);
    const filePath = projectedFilePath(span.attributes);
    items.push({
      id: `projected:${span.id}`,
      kind: projectedKind(span.kind),
      label: projectedActivityLabel(span.kind, toolName, span.label, span.attributes),
      detail: projectedActivityDetail(span.kind, toolName),
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
export function ClioActivityTimeline({
  items,
  messages,
}: {
  items: readonly ObservabilityActivityItem[];
  messages: readonly Message[];
}) {
  const [zoom, setZoom] = useState(1);
  const rows = useMemo(
    () =>
      items
        .map((item, index) => ({ item, index }))
        .sort((left, right) => {
          if (
            left.item.causalMessageId &&
            left.item.causalMessageId === right.item.causalMessageId &&
            left.item.causalOrder !== undefined &&
            right.item.causalOrder !== undefined
          ) {
            const byCausality = left.item.causalOrder - right.item.causalOrder;
            if (byCausality) return byCausality;
          }
          const byTime = (left.item.at ?? '').localeCompare(right.item.at ?? '');
          return byTime || left.index - right.index;
        })
        .map(({ item }) => item),
    [items],
  );
  const lanes = useMemo(() => causalLanes(rows), [rows]);
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
          <span aria-label="Agent strand colors" className="flex min-w-0 items-center gap-1">
            {lanes.map((lane) => (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                key={lane.id}
                style={{ backgroundColor: lane.color }}
                title={lane.label}
              />
            ))}
          </span>
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
            <PlusIcon aria-hidden="true" />
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
      <div className="min-w-0 overflow-x-auto py-1">
        <div className="w-full max-w-3xl" style={{ minWidth: `${graphWidth + 280}px` }}>
          {rows.map((item) => (
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
  const activate = () => {
    if (item.transcriptMessageId) {
      const activityTarget = item.kind === 'tool' ? `/activity-${encodeURIComponent(item.id)}` : '';
      const hash = `#message-${encodeURIComponent(item.transcriptMessageId)}${activityTarget}`;
      if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
      else window.location.hash = hash;
      return;
    }
    if (item.onActivate) {
      item.onActivate();
      return;
    }
    item.onOpen?.('conversation');
  };
  const content = (
    <div className="grid min-h-11 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2">
      <div className="relative h-11 shrink-0" style={{ width: graphWidth }}>
        <svg aria-hidden="true" className="absolute inset-0 size-full" preserveAspectRatio="none">
          {lanes.map((candidate) => {
            const lineX = 12 + candidate.index * laneSpacing;
            return (
              <line
                key={candidate.id}
                stroke={candidate.color}
                strokeOpacity="0.32"
                strokeWidth="2"
                x1={lineX}
                x2={lineX}
                y1="0"
                y2="44"
              />
            );
          })}
          {item.lifecycle === 'open' && lane.id !== parent.id ? (
            <path
              d={`M ${parentX} 0 C ${parentX} 18, ${x} 18, ${x} 22`}
              fill="none"
              stroke={lane.color}
              strokeWidth="2.5"
            />
          ) : null}
          {item.lifecycle === 'close' && lane.id !== parent.id ? (
            <path
              d={`M ${x} 22 C ${x} 30, ${parentX} 30, ${parentX} 44`}
              fill="none"
              stroke={lane.color}
              strokeWidth="2.5"
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
      <div className="min-w-0">
        <p className="truncate text-[10px] leading-3 text-muted-foreground" title={lane.label}>
          {lane.label}
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-xs font-medium">
          <span className="truncate">{item.label}</span>
        </p>
        {item.detail ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.detail}</p>
        ) : null}
      </div>
      <time
        className="shrink-0 text-[10px] tabular-nums text-muted-foreground"
        dateTime={item.at}
        title={item.timing === 'turn' ? 'Observed in its containing turn' : undefined}
      >
        {item.timing === 'turn'
          ? 'In this turn'
          : item.at
            ? formatGraphTime(item.at)
            : 'Time unavailable'}
      </time>
      <ClioStatus compact className="shrink-0" value={item.state} />
    </div>
  );
  if (!target) return <div className="border-b last:border-b-0">{content}</div>;
  return (
    <ClioInteractiveRow
      actions={item.onOpen ? (
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
      ) : undefined}
      aria-label={`Open transcript event ${item.label}`}
      className="min-h-0 border-b px-0 py-0 last:border-b-0"
      onClick={activate}
      role="button"
    >
      {content}
    </ClioInteractiveRow>
  );
}

function causalLaneId(item: ObservabilityActivityItem): string {
  if (item.ownerSessionId && item.ownerSessionId !== item.rootSessionId) return item.ownerSessionId;
  if ((item.depth ?? 0) > 0) return item.ownerSessionId || item.taskId || `depth-${item.depth}`;
  return 'main';
}

function causalLanes(items: readonly ObservabilityActivityItem[]): CausalLane[] {
  const lanes = new Map<string, Omit<CausalLane, 'index'>>([
    ['main', { id: 'main', label: 'Main agent', color: CAUSAL_COLORS[0]! }],
  ]);
  for (const item of items) {
    const id = causalLaneId(item);
    if (lanes.has(id)) continue;
    lanes.set(id, {
      id,
      label: item.ownerLabel || (item.lifecycle === 'open' ? item.label : 'Child agent'),
      color: CAUSAL_COLORS[lanes.size % CAUSAL_COLORS.length]!,
    });
  }
  const values = [...lanes.values()];
  const totals = new Map<string, number>();
  for (const lane of values) totals.set(lane.label, (totals.get(lane.label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return values.map((lane, index) => {
    const occurrence = (seen.get(lane.label) ?? 0) + 1;
    seen.set(lane.label, occurrence);
    return {
      ...lane,
      label: (totals.get(lane.label) ?? 0) > 1 ? `${lane.label}, turn ${occurrence}` : lane.label,
      index,
    };
  });
}

function ActivityGlyph({
  item,
  className,
}: {
  item: ObservabilityActivityItem;
  className: string;
}) {
  const props = { 'aria-hidden': true as const, className };
  if (item.lifecycle === 'open') return <GitBranchPlusIcon {...props} />;
  if (item.lifecycle === 'close') return <GitMergeIcon {...props} />;
  if (item.kind === 'tool') return <WrenchIcon {...props} />;
  if (item.kind === 'process') return <BoxesIcon {...props} />;
  if (item.kind === 'artifact') return <FileOutputIcon {...props} />;
  if (item.kind === 'interaction') return <MessageCircleQuestionIcon {...props} />;
  if (item.kind === 'resource') return <WaypointsIcon {...props} />;
  return <BotIcon {...props} />;
}

function projectedKind(kind: string): ObservabilityActivityItem['kind'] {
  if (kind === 'artifact') return 'artifact';
  if (kind === 'resource') return 'resource';
  if (kind === 'interaction' || kind === 'interactive_work') return 'interaction';
  return 'tool';
}

function projectedActivityDetail(kind: string, toolName?: string): string | undefined {
  const detail =
    kind === 'tool'
      ? undefined
      : kind === 'artifact'
        ? 'Produced artifact'
        : kind === 'resource'
          ? 'Evidence source'
          : kind === 'interaction'
            ? 'Human interaction'
            : 'Interactive surface or MCP task';
  return detail;
}

function projectedToolName(toolName: string | undefined, label: string): string | undefined {
  if (toolName) return toolName;
  return /^Tool\s+([^\s]+)\s+(?:started|completed|failed)\.?$/iu.exec(label)?.[1];
}

function projectedActivityLabel(
  kind: string,
  toolName: string | undefined,
  fallback: string,
  attributes: Record<string, unknown>,
): string {
  if (kind !== 'tool' || !toolName) return fallback;
  const input = attributes.tool_input;
  const qualifier =
    input && typeof input === 'object'
      ? ['filepath', 'path', 'uri', 'resource_id', 'task_id']
          .map((key) => (input as Record<string, unknown>)[key])
          .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined;
  const operation = provenanceFileFact(toolName) ?? humanizeToolName(toolName);
  if (!qualifier) return operation;
  const compact = qualifier.split(/[\\/]/u).filter(Boolean).at(-1) ?? qualifier;
  return `${operation} ${compact}`;
}

function projectedFilePath(attributes: Record<string, unknown>): string | undefined {
  const input = attributes.tool_input;
  if (!input || typeof input !== 'object') return undefined;
  const value = (input as Record<string, unknown>).filepath;
  return typeof value === 'string' && value.trim() ? value : undefined;
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

function formatGraphTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
}
