import type { SessionAgentTask } from '@clio/core';
import { PageHeader } from './common';
import { KvGrid, type KvRow } from '../../kit';

/** Known agent-task status literals (clio_agent.gact.agent_tasks) — used to
 * order the "child tasks" breakdown the same way the prototype's own
 * "completed" -> "running" reading order does. Any status outside this set
 * still renders (appended, unordered) rather than being silently dropped. */
const TASK_STATUS_ORDER = ['completed', 'running', 'queued', 'failed', 'cancelled'];

/** "82.1k" / "200k" — one decimal place, dropped when it would be ".0" (the
 * prototype's own literal "82.1k / 200k" mixes both forms for the same
 * reason: a round thousand reads cleaner without a trailing zero). */
function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  const rounded = Math.round((n / 1000) * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}k` : `${rounded.toFixed(1)}k`;
}

/** "4 completed · 2 running" — real per-status counts, not the prototype's
 * hardcoded mock string (which is static markup in the prototype itself,
 * not backed by any variable there either). */
function taskBreakdown(tasks: SessionAgentTask[]): string {
  const counts = new Map<string, number>();
  for (const task of tasks) {
    const status = String(task.status ?? '').toLowerCase() || 'unknown';
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const status of TASK_STATUS_ORDER) {
    const count = counts.get(status);
    if (count) parts.push(`${count} ${status}`);
  }
  for (const [status, count] of counts) {
    if (!TASK_STATUS_ORDER.includes(status)) parts.push(`${count} ${status}`);
  }
  return parts.join(' · ');
}

/**
 * Metrics — "This session, computed from the event stream," literally: all
 * four rows are the ACTIVE session's own real numbers, threaded down from
 * SessionView rather than fetched here (there is no per-session metrics
 * route; the session-scoped signal already lives in state SessionView
 * computed for the composer pill / transcript / Observability's own tools
 * tab, and this page reads the same values instead of re-deriving them).
 *
 * - context: the composer pill's real usedPercent + raw token/limit numbers.
 * - tool calls: a real count of `tool_call` parts in the loaded transcript
 *   (the same value that backs Observability's "tools" tab badge in the
 *   prototype's own JS, `obsToolCount`). The prototype's row also carries a
 *   static "all sessions" trailing label; that is false for a value that is
 *   actually session-scoped, so this renders the honest "this session"
 *   instead of copying a misleading mock string.
 * - child tasks: real count + a real completed/running/... breakdown from
 *   the pill's raw agent-task rows (GET /v1/sessions/{sid}/agent-tasks) —
 *   the prototype's own breakdown text is static markup in its source, not
 *   backed by a formula either, so a real one is strictly more honest.
 * - artifacts: the composer pill's real artifact count.
 *
 * Any row whose backing prop is `undefined` (data not loaded yet, or no
 * active session) is omitted rather than showing a fabricated zero.
 */
export function MetricsPage({
  contextPercent,
  contextTokens,
  contextLimit,
  artifactCount,
  toolCallCount,
  asyncTasks,
  onOpenObservability,
}: {
  contextPercent?: number;
  contextTokens?: number;
  contextLimit?: number;
  artifactCount?: number;
  toolCallCount?: number;
  asyncTasks?: SessionAgentTask[];
  onOpenObservability?: () => void;
}) {
  const header = (
    <PageHeader title="Metrics" subtitle="This session, computed from the event stream." />
  );

  const rows: KvRow[] = [];
  if (contextPercent !== undefined) {
    rows.push({
      key: 'CONTEXT',
      value: `${contextPercent}%`,
      ...(contextTokens !== undefined && contextLimit
        ? { trailing: `${formatTokenCount(contextTokens)} / ${formatTokenCount(contextLimit)}` }
        : {}),
    });
  }
  if (toolCallCount !== undefined) {
    rows.push({ key: 'TOOL CALLS', value: String(toolCallCount), trailing: 'this session' });
  }
  if (asyncTasks !== undefined) {
    rows.push({
      key: 'CHILD TASKS',
      value: String(asyncTasks.length),
      trailing: asyncTasks.length > 0 ? taskBreakdown(asyncTasks) : 'none',
    });
  }
  if (artifactCount !== undefined) {
    rows.push({ key: 'ARTIFACTS', value: String(artifactCount), trailing: 'this turn' });
  }

  return (
    <>
      {header}
      {rows.length > 0 ? (
        <KvGrid label="Metrics" rows={rows} />
      ) : (
        <p className="settings__note">No active session to report metrics for.</p>
      )}
      {onOpenObservability ? (
        <button type="button" className="settings__btn" onClick={onOpenObservability}>
          Open observability
        </button>
      ) : null}
    </>
  );
}
