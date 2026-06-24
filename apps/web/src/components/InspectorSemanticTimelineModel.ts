/**
 * Groups the `semantic.event` spine into per-turn timeline rows for the
 * Inspector, de-duplicating events already surfaced as part-derived rows.
 */
import type { SemanticEventPayload } from '@clio/core';

/** Event types whose information is already shown as part-derived timeline
 * rows (tool calls, permission prompts, ask-user, sub-agents) and are skipped
 * in the semantic feed to avoid double display. */
const SEMANTIC_DUP_PREFIXES = [
  'tool.call.',
  'permission.requested',
  'user_question.created',
  'subagent.',
] as const;

export interface SemanticTimelineRow {
  eventId: string;
  label: string;
  eventType: string;
  status: 'ok' | 'error' | 'running';
  at?: string;
}

export interface SemanticTurnGroup {
  turnId: string;
  rows: SemanticTimelineRow[];
}

/**
 * Group semantic events into per-turn timeline rows. Drops the event types
 * already covered by part-derived rows, sorts each turn's rows by occurred_at,
 * and returns turn groups newest-first. Never renders the free-form redacted
 * dicts (actor/subject/...), only id/status/summary/occurred_at.
 */
export function groupSemanticEvents(events: SemanticEventPayload[]): SemanticTurnGroup[] {
  const byTurn = new Map<string, SemanticTimelineRow[]>();
  const turnOrder: string[] = [];
  let firstSeenAt = 0;
  const firstSeen = new Map<string, number>();

  for (const ev of events) {
    if (!ev || typeof ev.event_type !== 'string') continue;
    if (isDuplicateSemantic(ev.event_type)) continue;
    const turnId = ev.turn_id ?? '(no turn)';
    if (!byTurn.has(turnId)) {
      byTurn.set(turnId, []);
      turnOrder.push(turnId);
      firstSeen.set(turnId, firstSeenAt++);
    }
    byTurn.get(turnId)!.push({
      eventId: ev.event_id,
      label:
        semanticLabelOverride(ev.event_type) ??
        ((ev.summary && ev.summary.trim()) || ev.event_type),
      eventType: ev.event_type,
      status: semanticDot(ev.status, ev.event_type),
      ...(ev.occurred_at ? { at: ev.occurred_at } : {}),
    });
  }

  const groups: SemanticTurnGroup[] = turnOrder.map((turnId) => ({
    turnId,
    rows: [...byTurn.get(turnId)!].sort(compareSemanticRowsByTime),
  }));

  groups.sort((a, b) => compareSemanticGroupsNewestFirst(a, b, firstSeen));
  return groups;
}

function isDuplicateSemantic(eventType: string): boolean {
  return SEMANTIC_DUP_PREFIXES.some((p) =>
    p.endsWith('.') ? eventType.startsWith(p) : eventType === p,
  );
}

function isInvalidToolSelection(eventType: string): boolean {
  return eventType === 'tool.selection.invalid' || eventType.startsWith('tool.selection.');
}

function semanticLabelOverride(eventType: string): string | null {
  if (isInvalidToolSelection(eventType)) return 'Invalid tool selection';
  return null;
}

function semanticDot(status?: string, eventType?: string): 'ok' | 'error' | 'running' {
  if (eventType && isInvalidToolSelection(eventType)) return 'error';
  if (status === 'failed' || status === 'blocked') return 'error';
  if (status === 'started' || status === 'running') return 'running';
  return 'ok';
}

function compareSemanticRowsByTime(
  a: SemanticTimelineRow,
  b: SemanticTimelineRow,
): number {
  const ta = a.at ? Date.parse(a.at) : NaN;
  const tb = b.at ? Date.parse(b.at) : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}

function compareSemanticGroupsNewestFirst(
  a: SemanticTurnGroup,
  b: SemanticTurnGroup,
  firstSeen: Map<string, number>,
): number {
  const la = latestSemanticRowTime(a);
  const lb = latestSemanticRowTime(b);
  if (la !== lb && Number.isFinite(la) && Number.isFinite(lb)) return lb - la;
  if (Number.isFinite(la) !== Number.isFinite(lb)) {
    return Number.isFinite(lb) ? 1 : -1;
  }
  return (firstSeen.get(b.turnId) ?? 0) - (firstSeen.get(a.turnId) ?? 0);
}

function latestSemanticRowTime(group: SemanticTurnGroup): number {
  let max = -Infinity;
  for (const row of group.rows) {
    const time = row.at ? Date.parse(row.at) : NaN;
    if (!Number.isNaN(time) && time > max) max = time;
  }
  return max;
}
