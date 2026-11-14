import type { RunState } from '@clio/core/v3';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { clioStatusLabel } from '@/components/clio/status';
import type { RunRow } from '@/routes/runs-rows';
import { formatLocale } from '@/lib/locale-format';
import { t } from '@lingui/core/macro';

/** The width of the hover action column every run row reserves. */
export const RUN_ACTIONS_WIDTH = 48;

export function runConversationHref(row: RunRow, withFlow = true): string | undefined {
  if (!row.workspaceId || !row.targetSessionId) return undefined;
  const base = `/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(row.targetSessionId)}`;
  return withFlow && row.flowHandle ? `${base}?flow=${encodeURIComponent(row.flowHandle)}` : base;
}

export type RunGroup = 'needs-you' | 'running' | 'queued' | 'earlier';

export const RUN_GROUP_LABELS: Record<RunGroup, string> = {
  'needs-you': t`Needs you`,
  running: t`Running`,
  queued: t`Queued`,
  earlier: t`Earlier`,
};

const SETTLED: readonly RunState[] = ['completed', 'failed', 'cancelled', 'interrupted'];

const NEEDS_YOU: readonly RunState[] = [
  'failed',
  'interrupted',
  'waiting_permission',
  'waiting_user',
  'task_state_uncertain',
  'recovery_required',
];

/** The same states as the "Needs attention" filter, plus recovery required. */
export function runGroup(state: RunState): RunGroup {
  if (NEEDS_YOU.includes(state)) return 'needs-you';
  if (state === 'queued') return 'queued';
  if (SETTLED.includes(state) || state === 'yielded' || state === 'stopped') return 'earlier';
  return 'running';
}

/** "now", "4m", "3h", "Tue", "Mar 3": fits the 44px time column. */
export function compactWhen(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '—';
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return t`now`;
  if (minutes < 60) return t`${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (minutes < 24 * 60) return t`${hours}h`;
  const date = new Date(at);
  if (minutes < 6 * 24 * 60) {
    return new Intl.DateTimeFormat(formatLocale(), { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(formatLocale(), { month: 'short', day: 'numeric' }).format(date);
}

/** A stop was asked for and the run has not settled yet. */
export function runCancelPending(row: Pick<RunRow, 'state'>, cancelRequested: boolean): boolean {
  return cancelRequested && !SETTLED.includes(row.state);
}

export function runStateLabel(row: Pick<RunRow, 'state'>, cancelRequested: boolean): string {
  return runCancelPending(row, cancelRequested)
    ? t`Cancellation requested`
    : clioStatusLabel(row.state);
}

/**
 * Develop's states folded onto a status mark and one plain word in a fixed
 * column: a spinner while working, a ring when queued, a dot for an outcome.
 */
const LOOK: Partial<Record<RunState, { tone: StatusTone; word: string }>> = {
  running: { tone: 'running', word: t({ message: 'running', context: 'run state' }) },
  recovering: { tone: 'running', word: t({ message: 'recovering', context: 'run state' }) },
  stopping: { tone: 'running', word: t({ message: 'stopping', context: 'run state' }) },
  cancellation_requested: {
    tone: 'running',
    word: t({ message: 'stopping', context: 'run state' }),
  },
  pause_requested: { tone: 'waiting', word: t({ message: 'pausing', context: 'run state' }) },
  paused: { tone: 'stopped', word: t({ message: 'paused', context: 'run state' }) },
  queued: { tone: 'idle', word: t({ message: 'queued', context: 'run state' }) },
  waiting_user: { tone: 'waiting', word: t({ message: 'reply', context: 'run state' }) },
  waiting_permission: { tone: 'waiting', word: t({ message: 'approve', context: 'run state' }) },
  task_state_uncertain: { tone: 'warning', word: t({ message: 'inspect', context: 'run state' }) },
  recovery_required: { tone: 'warning', word: t({ message: 'inspect', context: 'run state' }) },
  completed: { tone: 'success', word: t({ message: 'done', context: 'run state' }) },
  failed: { tone: 'error', word: t({ message: 'failed', context: 'run state' }) },
  cancelled: { tone: 'stopped', word: t({ message: 'cancelled', context: 'run state' }) },
  interrupted: { tone: 'stopped', word: t({ message: 'halted', context: 'run state' }) },
  stopped: { tone: 'stopped', word: t({ message: 'stopped', context: 'run state' }) },
  yielded: { tone: 'idle', word: t({ message: 'idle', context: 'run state' }) },
};

/** The mark tone and the one word a run's state column shows. */
export function runLook(row: Pick<RunRow, 'state'>): { tone: StatusTone; word: string } {
  return LOOK[row.state] ?? { tone: 'info', word: row.state };
}
