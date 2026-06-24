/**
 * Model for the conversation-level execution trace: `ExecutionTraceRow` and
 * the row-building logic behind ConversationExecutionTrace.tsx.
 */
import type { SemanticEventPayload } from '@clio/core';
import { normalizeWhitespace } from '../presentationUtils.js';

/**
 * v0.2 semantic-execution spine, surfaced INLINE in the conversation.
 *
 * The Inspector timeline (`InspectorSemanticTimelineModel`) already groups the
 * `semantic.event` spine for the side drawer. This model is its conversation
 * sibling: it distils the same spine into a compact, opt-in per-turn
 * "execution" strip the user can disclose under each assistant turn — the
 * agent invocations, expert handoffs, tool runs (with wall-clock timings) and
 * memory accesses that produced the answer. The TUI integrates the same
 * execution timeline into its transcript (`execution_render.go`); the web does
 * it with a native `<details>` disclosure instead of TUI glyphs.
 *
 * REDACTION: `actor` / `subject` / `payload` string values may be the literal
 * sentinel `"[redacted]:N chars"`. Those must NEVER be rendered as content, so
 * every string pulled from a free-form dict is funnelled through `cleanField`,
 * which drops the sentinel. `event_id` / `status` / `occurred_at` / `turn_id`
 * are never redacted.
 */

const REDACTED_RE = /^\[redacted\]:\d+ chars$/i;

/** A single execution-trace row (one semantic event projected to UI shape). */
export interface ExecutionTraceRow {
  eventId: string;
  /** Coarse category drives the row icon + accent. */
  kind: 'agent' | 'handoff' | 'tool' | 'memory' | 'turn';
  /** Short, human label — never a redaction sentinel. */
  label: string;
  /** Optional agent that owns this row (e.g. tool ran inside an expert). */
  agent?: string;
  /** Rounded wall-clock duration in ms, when the spine carried one. */
  durationMs?: number;
  status: 'ok' | 'error' | 'running';
  at?: string;
}

export interface ExecutionTraceTurn {
  turnId: string;
  rows: ExecutionTraceRow[];
  /** Count of tool runs in the turn — drives the collapsed summary chip. */
  toolCount: number;
  /** Distinct agents seen — drives the collapsed summary chip. */
  agentCount: number;
}

/** Event types that carry no conversation-trace value (already shown as
 * transcript parts, or pure plumbing) and are dropped from the inline strip. */
const SKIP_PREFIXES = [
  'message.',
  'permission.',
  'user_question.',
  'context.file.',
  'file.diff.',
  'tool.call.started',
  'tool.selection.',
] as const;

/**
 * Project the semantic spine into inline per-turn execution traces, in the
 * conversation's turn order (oldest turn first; a turn's rows in occurred-at
 * order). Returns a Map keyed by `turn_id` (which clio sets to the user message
 * id) so the Transcript can attach a strip under the matching assistant turn.
 */
export function buildExecutionTraceByTurn(
  events: SemanticEventPayload[],
): Map<string, ExecutionTraceTurn> {
  const byTurn = new Map<string, ExecutionTraceRow[]>();
  const order: string[] = [];

  for (const ev of events) {
    if (!ev || typeof ev.event_type !== 'string') continue;
    if (shouldSkip(ev.event_type)) continue;
    const row = projectRow(ev);
    if (!row) continue;
    const turnId = (ev.turn_id ?? '').trim();
    if (!turnId) continue;
    if (!byTurn.has(turnId)) {
      byTurn.set(turnId, []);
      order.push(turnId);
    }
    const rows = byTurn.get(turnId)!;
    if (rows.some((r) => r.eventId === row.eventId)) continue;
    rows.push(row);
  }

  const out = new Map<string, ExecutionTraceTurn>();
  for (const turnId of order) {
    const rows = [...byTurn.get(turnId)!].sort(compareByTime);
    const agents = new Set<string>();
    let toolCount = 0;
    for (const r of rows) {
      if (r.kind === 'tool') toolCount++;
      if (r.agent) agents.add(r.agent);
    }
    out.set(turnId, { turnId, rows, toolCount, agentCount: agents.size });
  }
  return out;
}

function shouldSkip(eventType: string): boolean {
  return SKIP_PREFIXES.some((p) => eventType === p || eventType.startsWith(p));
}

function projectRow(ev: SemanticEventPayload): ExecutionTraceRow | null {
  const base = {
    eventId: ev.event_id,
    status: traceStatus(ev.status),
    ...(ev.occurred_at ? { at: ev.occurred_at } : {}),
  };
  const summary = cleanField(ev.summary);
  const durationMs = numberField(ev.payload, 'duration_ms');
  const agent =
    cleanField(field(ev.actor, 'agent_id')) || cleanField(field(ev.payload, 'agent_id')) || undefined;

  if (ev.event_type === 'tool.call.completed' || ev.event_type === 'tool.started') {
    const tool =
      cleanField(field(ev.payload, 'tool')) ||
      cleanField(field(ev.actor, 'tool')) ||
      cleanField(field(ev.subject, 'tool'));
    return {
      ...base,
      kind: 'tool',
      label: tool ? `${tool}` : summary || 'tool run',
      ...(agent ? { agent } : {}),
      ...(durationMs !== undefined ? { durationMs: Math.round(durationMs) } : {}),
    };
  }

  if (
    ev.event_type === 'blueprint.delegation.started' ||
    ev.event_type === 'blueprint.delegation.completed' ||
    ev.event_type === 'blueprint.delegation.parent_resumed' ||
    ev.event_type === 'subagent.started' ||
    ev.event_type === 'subagent.completed'
  ) {
    const from = cleanField(field(ev.actor, 'agent_id'));
    const to = cleanField(field(ev.subject, 'agent_id'));
    const label = handoffLabel(ev.event_type, from, to) || summary || 'expert handoff';
    return {
      ...base,
      kind: 'handoff',
      label,
      ...(agent ? { agent } : {}),
      ...(durationMs !== undefined ? { durationMs: Math.round(durationMs) } : {}),
    };
  }

  if (ev.event_type.startsWith('agent.invocation.')) {
    return {
      ...base,
      kind: 'agent',
      label: summary || (agent ? `${agent} ${invocationVerb(ev.event_type)}` : 'agent step'),
      ...(agent ? { agent } : {}),
      ...(durationMs !== undefined ? { durationMs: Math.round(durationMs) } : {}),
    };
  }

  if (ev.event_type.startsWith('memory.')) {
    return {
      ...base,
      kind: 'memory',
      label: summary || memoryLabel(ev.event_type),
      ...(agent ? { agent } : {}),
    };
  }

  if (ev.event_type.startsWith('turn.')) {
    // Only surface turn boundaries that carry signal (failures); a bare
    // started/completed pair is noise next to the rows it brackets.
    if (ev.event_type !== 'turn.failed' && base.status !== 'error') return null;
    return { ...base, kind: 'turn', label: summary || 'turn failed' };
  }

  return null;
}

function handoffLabel(eventType: string, from: string, to: string): string {
  if (eventType === 'blueprint.delegation.parent_resumed') {
    return from ? `${from} resumed` : 'workflow resumed';
  }
  if (eventType.endsWith('.completed')) {
    return from ? `${from} returned evidence` : 'expert returned evidence';
  }
  if (from && to) return `${from} → ${to}`;
  if (to) return `delegated to ${to}`;
  return 'expert handoff';
}

function invocationVerb(eventType: string): string {
  if (eventType.endsWith('.completed')) return 'completed';
  if (eventType.endsWith('.started')) return 'started';
  if (eventType.endsWith('.failed')) return 'failed';
  return 'step';
}

function memoryLabel(eventType: string): string {
  switch (eventType) {
    case 'memory.search.completed':
      return 'searched memory';
    case 'memory.compacted':
      return 'compacted memory';
    case 'memory.policy_summary':
      return 'summarized memory policy';
    default:
      return 'accessed memory';
  }
}

function traceStatus(status?: string): 'ok' | 'error' | 'running' {
  if (status === 'failed' || status === 'blocked') return 'error';
  if (status === 'started' || status === 'running') return 'running';
  return 'ok';
}

/** Pull a string field from a free-form dict, dropping redaction sentinels. */
function field(record: Record<string, unknown> | undefined, key: string): string {
  if (!record) return '';
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function numberField(record: Record<string, unknown> | undefined, key: string): number | undefined {
  if (!record) return undefined;
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Trim and reject redaction sentinels — sentinels must never render. */
function cleanField(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = normalizeWhitespace(value);
  if (!text || REDACTED_RE.test(text)) return '';
  return text.length <= 96 ? text : `${text.slice(0, 93).trimEnd()}...`;
}

function compareByTime(a: ExecutionTraceRow, b: ExecutionTraceRow): number {
  const ta = a.at ? Date.parse(a.at) : NaN;
  const tb = b.at ? Date.parse(b.at) : NaN;
  if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
  if (Number.isNaN(ta)) return 1;
  if (Number.isNaN(tb)) return -1;
  return ta - tb;
}
