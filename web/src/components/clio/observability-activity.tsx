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
} from 'lucide-react';
import { useMemo } from 'react';
import {
  Timeline,
  TimelineContent,
  TimelineDate,
  TimelineHeader,
  TimelineIndicator,
  TimelineItem,
  TimelineSeparator,
  TimelineTitle,
} from '@/components/reui/timeline';
import { Button } from '@/components/ui/button';
import { formatNestingDepth, truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus, clioStatusLabel, type ClioStatusValue } from './status';
import type { SubagentOpenTarget } from './subagent-card';
import { humanizeToolName } from './tool-presentation';
import {
  isAgentMcpInteraction,
  isCausalQuestionInteraction,
  questionInteractionRequestLabel,
} from './agent-answer-domain';

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
  onOpen?: (target: SubagentOpenTarget) => void;
}

interface ActivityGroup {
  id: string;
  at?: string;
  /** Where the group's timestamp came from: a server event, or its containing turn. */
  atTiming?: 'event' | 'turn';
  mainTurn: boolean;
  depth: number;
  items: ObservabilityActivityItem[];
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
 * Build the child-only portion of the timeline from CLIO's authoritative projection.
 * No message or reasoning content is consulted here.
 */
// Pure projection helper is exported for attribution and lifecycle contract tests.
// oxlint-disable-next-line react/only-export-components
export function childProjectionActivityItems(
  provenance: ExecutionProvenanceResult,
  processes: readonly AsyncProcess[],
  knownToolIds: ReadonlySet<string> = new Set(),
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
    if (ownerSessionId === rootSessionId || !HIGH_SIGNAL_CHILD_KINDS.has(span.kind)) continue;
    if (
      span.kind === 'tool' &&
      (knownToolIds.has(span.id) ||
        Boolean(span.invocation_id && knownToolIds.has(span.invocation_id)))
    ) {
      continue;
    }
    const owner = lineageBySession.get(ownerSessionId);
    items.push({
      id: `projected:${span.id}`,
      kind: projectedKind(span.kind),
      label: span.label,
      detail: projectedActivityDetail(span.kind, span.tool_name, owner?.label),
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
    });
  }
  return items;
}

/** Causal activity timeline that keeps every record nested under its owning main-agent turn. */
export function ClioActivityTimeline({
  items,
  messages,
}: {
  items: readonly ObservabilityActivityItem[];
  messages: readonly Message[];
}) {
  const groups = useMemo(() => groupActivity(items, messages), [items, messages]);
  if (!groups.length) {
    return (
      <p className="p-6 text-center text-sm text-muted-foreground">
        No run or tool activity is available.
      </p>
    );
  }
  return (
    <Timeline defaultValue={groups.length}>
      {groups.map((group, index) => (
        <TimelineItem
          key={group.id}
          step={index + 1}
          style={{ marginInlineStart: `${Math.min(group.depth, 8) * 14}px` }}
        >
          <TimelineIndicator />
          <TimelineSeparator />
          <TimelineDate className="flex flex-wrap items-center gap-2" dateTime={group.at}>
            <span>{group.at ? formatTimestamp(group.at) : 'Time unavailable'}</span>
            {group.atTiming === 'turn' ? (
              <span className="font-normal">Observed in its containing turn</span>
            ) : null}
          </TimelineDate>
          <TimelineHeader className="flex items-start justify-between gap-2">
            <TimelineTitle>
              {group.mainTurn
                ? 'Main agent'
                : group.depth
                  ? (group.items[0]?.ownerLabel ?? 'Child work')
                  : 'Activity'}
            </TimelineTitle>
          </TimelineHeader>
          <TimelineContent className="mt-2 grid gap-1">
            {group.items.map((item) => (
              <ActivityRow baseDepth={group.depth} item={item} key={`${item.kind}:${item.id}`} />
            ))}
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}

function ActivityRow({ baseDepth, item }: { baseDepth: number; item: ObservabilityActivityItem }) {
  const rowStyle = {
    marginInlineStart: `${Math.max(0, Math.min((item.depth ?? 0) - baseDepth, 8)) * 14}px`,
  };
  const content = (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-2 px-1 py-1.5">
      <ActivityGlyph
        className={cn(
          'mt-0.5 size-3.5',
          item.kind === 'tool'
            ? 'text-info'
            : item.kind === 'process' || item.kind === 'artifact'
              ? 'text-primary'
              : 'text-muted-foreground',
        )}
        item={item}
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{item.label}</p>
        {item.detail ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.detail}</p>
        ) : null}
      </div>
      <ActivityStatus item={item} />
    </div>
  );
  if (!item.onOpen)
    return (
      <div className="rounded-md hover:bg-muted/35" style={rowStyle}>
        {content}
      </div>
    );
  return (
    <ClioInteractiveRow
      actions={
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
      }
      aria-label={activityRowAriaLabel(item)}
      className="min-h-0 px-0 py-0"
      onClick={(event) => item.onOpen?.(event.shiftKey ? 'canvas' : 'conversation')}
      role="button"
      style={rowStyle}
    >
      {content}
    </ClioInteractiveRow>
  );
}

function ActivityStatus({ item }: { item: ObservabilityActivityItem }) {
  return <ClioStatus className="mt-0 shrink-0 py-0.5" value={item.state} />;
}

function activityRowAriaLabel(item: ObservabilityActivityItem): string {
  const depthDetail = formatNestingDepth(item.depth ?? 0);
  return `${item.label}, ${clioStatusLabel(item.state)}${depthDetail ? `, ${depthDetail}` : ''}`;
}

function groupActivity(
  items: readonly ObservabilityActivityItem[],
  messages: readonly Message[],
): ActivityGroup[] {
  const mainTurns = new Map(
    messages.filter((message) => message.role === 'user').map((message) => [message.id, message]),
  );
  const groups = new Map<string, ActivityGroup>();
  for (const item of items) {
    const id = item.groupId ?? `${item.kind}:${item.id}`;
    const group = groups.get(id);
    if (group) {
      group.items.push(item);
      group.depth = Math.min(group.depth, item.depth ?? 0);
      const at = laterTimestamp(group.at, item.at);
      if (at !== group.at) {
        group.at = at;
        group.atTiming = item.timing;
      }
      continue;
    }
    const containingTurnAt = mainTurns.get(id)?.created_at;
    groups.set(id, {
      id,
      at: item.at ?? containingTurnAt,
      atTiming: item.at ? item.timing : containingTurnAt ? 'turn' : undefined,
      mainTurn: mainTurns.has(id),
      depth: mainTurns.has(id) ? 0 : (item.depth ?? 0),
      items: [item],
    });
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => (left.at ?? '').localeCompare(right.at ?? '')),
    }))
    .sort((left, right) => (right.at ?? '').localeCompare(left.at ?? ''));
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

function projectedActivityDetail(kind: string, toolName?: string, ownerLabel?: string): string {
  const detail =
    kind === 'tool'
      ? toolName
        ? humanizeToolName(toolName)
        : 'Tool activity'
      : kind === 'artifact'
        ? 'Produced artifact'
        : kind === 'resource'
          ? 'Evidence source'
          : kind === 'interaction'
            ? 'Human interaction'
            : 'Interactive surface or MCP task';
  return ownerLabel ? `${ownerLabel} · ${detail}` : detail;
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

function laterTimestamp(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left.localeCompare(right) >= 0 ? left : right;
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
