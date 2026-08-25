import type { Message, RunState } from '@clio/core/v3';
import { BotIcon, BoxesIcon, WrenchIcon } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { ClioStatus, type ClioStatusValue } from './status';

export interface ObservabilityActivityItem {
  id: string;
  kind: 'run' | 'tool' | 'process';
  label: string;
  detail: string;
  state: RunState | ClioStatusValue;
  statusLabel?: string;
  statusDetail?: string;
  at?: string;
  groupId?: string;
  timing?: 'event' | 'turn';
}

interface ActivityGroup {
  id: string;
  at?: string;
  mainTurn: boolean;
  items: ObservabilityActivityItem[];
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
        <TimelineItem key={group.id} step={index + 1}>
          <TimelineIndicator />
          <TimelineSeparator />
          <TimelineDate dateTime={group.at}>
            {group.at ? formatTimestamp(group.at) : 'Time unavailable'}
          </TimelineDate>
          <TimelineHeader className="flex items-start justify-between gap-2">
            <TimelineTitle>{group.mainTurn ? 'Main agent' : group.items[0]?.label}</TimelineTitle>
            {!group.mainTurn && group.items.length === 1 ? (
              <ActivityStatus item={group.items[0]!} />
            ) : null}
          </TimelineHeader>
          <TimelineContent className="mt-2 grid gap-1">
            {!group.mainTurn && group.items.length === 1 ? (
              <p className="text-xs leading-5 text-muted-foreground">{group.items[0]!.detail}</p>
            ) : (
              group.items.map((item) => <ActivityRow item={item} key={`${item.kind}:${item.id}`} />)
            )}
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  );
}

function ActivityRow({ item }: { item: ObservabilityActivityItem }) {
  const Icon = item.kind === 'tool' ? WrenchIcon : item.kind === 'process' ? BoxesIcon : BotIcon;
  return (
    <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-2 rounded-md px-1 py-1.5 hover:bg-muted/35">
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-3.5',
          item.kind === 'tool'
            ? 'text-info'
            : item.kind === 'process'
              ? 'text-primary'
              : 'text-muted-foreground',
        )}
      />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">{item.label}</p>
        <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">{item.detail}</p>
      </div>
      <ActivityStatus item={item} />
    </div>
  );
}

function ActivityStatus({ item }: { item: ObservabilityActivityItem }) {
  return (
    <ClioStatus
      className="mt-0 shrink-0 py-0.5"
      detail={item.statusDetail}
      label={item.statusLabel}
      value={item.state}
    />
  );
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
      group.at = laterTimestamp(group.at, item.at);
      continue;
    }
    groups.set(id, {
      id,
      at: item.at ?? mainTurns.get(id)?.created_at,
      mainTurn: mainTurns.has(id),
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
