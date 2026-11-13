import type { ObservabilityActivityItem } from './observability-activity';
import type { ClioStatusValue } from './status';
import { t } from '@lingui/core/macro';
import { formatLocale } from '@/lib/locale-format';

/** Lane colors read the theme's chart and category tokens, so they follow theme changes. */
const CAUSAL_COLORS = [
  'var(--chart-1)',
  'var(--chart-4)',
  'var(--category-2)',
  'var(--chart-3)',
  'var(--chart-5)',
  'var(--chart-2)',
];

export interface CausalLane {
  id: string;
  label: string;
  color: string;
  index: number;
}

/** Transcript order where the transcript knows it, then time, then arrival. */
export function causalRows(
  items: readonly ObservabilityActivityItem[],
): ObservabilityActivityItem[] {
  return items
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
    .map(({ item }) => item);
}

// States a reader must notice without hovering: the word sits beside the label so it never
// depends on the status icon's colour or tooltip, and stays visible on narrow tabs.
export const CAUSAL_ATTENTION_STATES: ReadonlySet<string> = new Set<ClioStatusValue>([
  'failed',
  'denied',
  'interrupted',
  'cancelled',
  'waiting_permission',
  'waiting_user',
]);

export function causalAttentionTone(state: string): string {
  if (state === 'failed' || state === 'denied') return 'text-destructive';
  if (state === 'interrupted') return 'text-warning';
  if (state === 'waiting_permission' || state === 'waiting_user') return 'text-action';
  return 'text-muted-foreground';
}

export function causalLaneId(item: ObservabilityActivityItem): string {
  if (item.ownerSessionId && item.ownerSessionId !== item.rootSessionId) return item.ownerSessionId;
  if ((item.depth ?? 0) > 0) return item.ownerSessionId || item.taskId || `depth-${item.depth}`;
  return 'main';
}

export function causalLanes(items: readonly ObservabilityActivityItem[]): CausalLane[] {
  const lanes = new Map<string, Omit<CausalLane, 'index'>>([
    ['main', { id: 'main', label: t`Main agent`, color: CAUSAL_COLORS[0]! }],
  ]);
  // A lane named only by this fallback takes the first open item's label.
  const childAgent = t`Child agent`;
  for (const item of items) {
    const id = causalLaneId(item);
    const existing = lanes.get(id);
    if (existing) {
      if (id !== 'main' && item.ownerLabel) existing.label = item.ownerLabel;
      else if (existing.label === childAgent && item.lifecycle === 'open')
        existing.label = item.label;
      continue;
    }
    lanes.set(id, {
      id,
      label: item.ownerLabel || (item.lifecycle === 'open' ? item.label : childAgent),
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
    const laneLabel = lane.label;
    return {
      ...lane,
      label: (totals.get(laneLabel) ?? 0) > 1 ? t`${laneLabel}, turn ${occurrence}` : laneLabel,
      index,
    };
  });
}

export function formatGraphTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? t`Time unavailable`
    : new Intl.DateTimeFormat(formatLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
}
