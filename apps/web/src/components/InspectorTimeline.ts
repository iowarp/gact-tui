/**
 * Assembles a per-message execution timeline (routing, thinking, tools, diffs,
 * handoffs) from message parts, and re-exports the semantic-event grouping.
 */
import type { Message } from '@clio/core';
import { formatCostUsd, formatDurationSeconds } from '../formatters.js';

export {
  groupSemanticEvents,
  type SemanticTimelineRow,
  type SemanticTurnGroup,
} from './InspectorSemanticTimelineModel.js';

export interface TimelineEvent {
  /** Event kind — drives icon + color. */
  kind: 'started' | 'routing' | 'thinking' | 'tool' | 'diff' | 'text' | 'handoff' | 'completed';
  label: string;
  detail?: string;
  /** Measured duration where the wire provides one (tool results). */
  durationMs?: number;
  /** Absolute timestamp where the wire provides one — never fabricated. */
  at?: string;
  status: 'ok' | 'error' | 'running';
}

/**
 * Build the per-turn execution timeline from a message's parts.
 *
 * Honest representation: the GACT wire guarantees parts arrive in append
 * order but does NOT timestamp individual parts, so the timeline shows
 * real sequence, plus timestamps/durations only where the wire actually
 * provides them (message created/updated, tool_result.duration_ms).
 */
export function assembleTimeline(msg: Message): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  events.push({
    kind: 'started',
    label: msg.role === 'assistant' ? 'Turn started' : 'Message sent',
    ...(msg.created_at ? { at: msg.created_at } : {}),
    status: 'ok',
  });

  // Pair tool calls with their results for status + duration.
  const resultByCallId = new Map<string, { is_error?: boolean; duration_ms?: number }>();
  for (const p of msg.parts) {
    if (p.type === 'tool_result') {
      const cid = p.call_id ?? p.tool_call_id;
      if (cid) resultByCallId.set(cid, p);
    }
  }

  let textEmitted = false;
  for (const p of msg.parts) {
    switch (p.type) {
      case 'routing_decision':
        events.push({
          kind: 'routing',
          label: `Routed to ${p.selected_agent}`,
          ...(p.rationale ? { detail: p.rationale } : {}),
          status: 'ok',
        });
        break;
      case 'thinking': {
        const body =
          (p as { thinking?: string; text?: string }).thinking ??
          (p as { text?: string }).text ??
          '';
        const words = body.trim() ? body.trim().split(/\s+/).length : 0;
        events.push({
          kind: 'thinking',
          label: 'Thinking',
          ...(words > 0 ? { detail: `~${words} words` } : {}),
          status: 'ok',
        });
        break;
      }
      case 'tool_call': {
        const cid = p.call_id ?? p.id ?? '';
        const res = cid ? resultByCallId.get(cid) : undefined;
        events.push({
          kind: 'tool',
          label: p.tool_name,
          detail: res ? (res.is_error ? 'failed' : 'completed') : 'no result recorded',
          ...(res?.duration_ms != null ? { durationMs: res.duration_ms } : {}),
          status: res ? (res.is_error ? 'error' : 'ok') : 'running',
        });
        break;
      }
      case 'file_diff':
        events.push({
          kind: 'diff',
          label: 'Proposed diff',
          detail: p.path,
          status: 'ok',
        });
        break;
      case 'expert_handoff':
        events.push({
          kind: 'handoff',
          label: 'Expert handoff',
          ...(p.text ? { detail: p.text } : {}),
          status: 'ok',
        });
        break;
      case 'text':
        // One row for the response text, however many text parts stream in.
        if (!textEmitted) {
          events.push({ kind: 'text', label: 'Response text', status: 'ok' });
          textEmitted = true;
        }
        break;
      default:
        break;
    }
  }

  if (msg.stop_reason) {
    const failed = msg.stop_reason === 'error';
    const tokens = msg.tokens;
    const bits: string[] = [];
    if (tokens?.input != null || tokens?.output != null) {
      bits.push(`${tokens?.input ?? 0}→${tokens?.output ?? 0} tok`);
    }
    if (msg.cost_usd) bits.push(`$${formatCostUsd(msg.cost_usd)}`);
    // Real elapsed time between the wire's own created/updated stamps.
    if (msg.created_at && msg.updated_at) {
      const ms = new Date(msg.updated_at).getTime() - new Date(msg.created_at).getTime();
      if (ms > 0) bits.push(`${formatDurationSeconds(ms)}s`);
    }
    events.push({
      kind: 'completed',
      label: failed ? 'Turn failed' : `Turn completed (${msg.stop_reason})`,
      ...(bits.length ? { detail: bits.join(' · ') } : {}),
      ...(msg.updated_at ? { at: msg.updated_at } : {}),
      status: failed ? 'error' : 'ok',
    });
  }
  return events;
}
