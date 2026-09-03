import type { AsyncProcess, ExecutionProvenanceResult, Message, RunState } from '@clio/core/v3';
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
import { truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { ClioInteractiveRow } from './interactive-row';
import { ClioStatus, type ClioStatusValue } from './status';
import type { SubagentOpenTarget } from './subagent-card';

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

const HIGH_SIGNAL_CHILD_KINDS = new Set([
  'tool',
  'artifact',
  'interaction',
  'interactive_work',
  'resource',
]);

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
    if (!owner.depth || !owner.task_id) continue;
    const process = processByTask.get(owner.task_id);
    const state = activityState(process?.live_state ?? owner.status ?? 'running');
    const common = {
      kind: 'process' as const,
      label: process?.title || owner.label || owner.task_id,
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
      detail: owner.agent_id ? `Delegated to ${owner.agent_id}` : 'Delegated child work',
      // A historical delegation event must not retain a permanent running animation after the
      // child has settled; the separate branch-close event carries the terminal outcome.
      state: isTerminalState(state) ? 'completed' : state,
      at: process?.created_at ?? owner.created_at,
      groupId: process?.parent_turn_id,
      timing: process?.created_at || owner.created_at ? 'event' : undefined,
      lifecycle: 'open',
    });
    const closedAt = process?.updated_at ?? owner.updated_at;
    if (isTerminalState(state) && closedAt) {
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
      taskId: process.id,
      taskPath: process.task_path,
      depth: owner?.depth ?? process.task_path?.length ?? 0,
      lifecycle: 'event',
    });
  }

  for (const span of provenance.spans) {
    const ownerSessionId = span.owner_session_id ?? span.session_id;
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
      aria-label={`${item.label}, ${item.state}${item.depth ? `, depth ${item.depth}` : ''}`}
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
      ? toolName || 'Tool activity'
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
