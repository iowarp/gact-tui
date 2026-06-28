/**
 * Distills raw SSE events into the ordered execution-trace timeline shown in the
 * conversation. Exports {@link ExecutionTranscriptEvent} and the
 * {@link appendExecutionTranscriptEvent} filter/append helper.
 */
import type { Part } from '@clio/core';

export interface ExecutionTranscriptEvent {
  sequence: number;
  type: string;
  turnId?: string;
  payload: Record<string, unknown>;
  part?: Part;
}

interface ExecutionTranscriptSink {
  setExecutionEvents?: (
    n: ExecutionTranscriptEvent[] | ((p: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
  ) => void;
}

const SEMANTIC_EXECUTION_EVENT_TYPES = new Set([
  'expert.lifecycle.started',
  'blueprint.delegation.started',
  'blueprint.delegation.completed',
  'expert.extract.completed',
  'react.step.completed',
  'tool.call.started',
  'tool.call.completed',
]);

export function appendExecutionTranscriptEvent(
  eventType: string | undefined,
  payload: Record<string, unknown>,
  hooks: ExecutionTranscriptSink,
  part?: Part,
) {
  if (!hooks.setExecutionEvents || !eventType) return;
  const type = executionTranscriptEventType(eventType, payload);
  if (!type || shouldSkipExecutionEvent(eventType, payload, part)) return;
  hooks.setExecutionEvents((prev) => [
    ...prev,
    {
      sequence: prev.length + 1,
      type,
      turnId: String(payload['turn_id'] ?? ''),
      payload,
      ...(part ? { part } : {}),
    },
  ]);
}

function executionTranscriptEventType(eventType: string, payload: Record<string, unknown>): string {
  if (eventType !== 'semantic.event') return eventType;
  const type = String(payload['event_type'] ?? '');
  return SEMANTIC_EXECUTION_EVENT_TYPES.has(type) ? type : '';
}

function shouldSkipExecutionEvent(
  eventType: string,
  payload: Record<string, unknown>,
  part?: Part,
): boolean {
  if (eventType === 'message.part.delta') {
    const delta = (payload['delta'] as { text_append?: string } | undefined) ?? {};
    return !delta.text_append?.trim();
  }
  if (eventType === 'message.part.added') {
    if (!part) return true;
    if (part.type === 'text' && String(payload['stream_source'] ?? '').trim() === 'live') return true;
    if (part.type === 'text' && !(part.text ?? '').trim()) return true;
    return part.type !== 'text' && part.type !== 'expert_handoff';
  }
  return false;
}
