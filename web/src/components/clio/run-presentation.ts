import type { RunState } from '@clio/core/v3';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { clioStatusLabel } from '@/components/clio/status';
import type { RunRow } from '@/routes/runs-rows';

/** The width of the hover action column every run row reserves. */
export const RUN_ACTIONS_WIDTH = 48;

export function runConversationHref(row: RunRow, withFlow = true): string | undefined {
  if (!row.workspaceId || !row.targetSessionId) return undefined;
  const base = `/workspaces/${encodeURIComponent(row.workspaceId)}/sessions/${encodeURIComponent(row.targetSessionId)}`;
  return withFlow && row.flowHandle ? `${base}?flow=${encodeURIComponent(row.flowHandle)}` : base;
}

export type RunGroup = 'needs-you' | 'running' | 'queued' | 'earlier';

export const RUN_GROUP_LABELS: Record<RunGroup, string> = {
  'needs-you': 'Needs you',
  running: 'Running',
  queued: 'Queued',
  earlier: 'Earlier',
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
  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
  const date = new Date(at);
  if (minutes < 6 * 24 * 60) {
    return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

export function runStateLabel(row: Pick<RunRow, 'state'>, cancelRequested: boolean): string {
  return cancelRequested && !SETTLED.includes(row.state)
    ? 'Cancellation requested'
    : clioStatusLabel(row.state);
}

/**
 * Develop's states folded onto a status mark and one plain word in a fixed
 * column: a spinner while working, a ring when queued, a dot for an outcome.
 */
const LOOK: Partial<Record<RunState, { tone: StatusTone; word: string }>> = {
  running: { tone: 'running', word: 'running' },
  recovering: { tone: 'running', word: 'recovering' },
  stopping: { tone: 'running', word: 'stopping' },
  cancellation_requested: { tone: 'running', word: 'stopping' },
  pause_requested: { tone: 'waiting', word: 'pausing' },
  paused: { tone: 'stopped', word: 'paused' },
  queued: { tone: 'idle', word: 'queued' },
  waiting_user: { tone: 'waiting', word: 'reply' },
  waiting_permission: { tone: 'waiting', word: 'approve' },
  task_state_uncertain: { tone: 'warning', word: 'inspect' },
  recovery_required: { tone: 'warning', word: 'inspect' },
  completed: { tone: 'success', word: 'done' },
  failed: { tone: 'error', word: 'failed' },
  cancelled: { tone: 'stopped', word: 'cancelled' },
  interrupted: { tone: 'stopped', word: 'halted' },
  stopped: { tone: 'stopped', word: 'stopped' },
  yielded: { tone: 'idle', word: 'idle' },
};

/** The mark tone and the one word a run's state column shows. */
export function runLook(row: Pick<RunRow, 'state'>): { tone: StatusTone; word: string } {
  return LOOK[row.state] ?? { tone: 'info', word: row.state };
}
