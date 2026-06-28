/**
 * Reduces `semantic.event` SSE events into the capped, de-duplicated semantic
 * observability feed (and the execution trace). Exports
 * {@link applySemanticFeedEvent} and the {@link appendUniqueSemanticEvent} helper.
 */
import type { SemanticEventPayload } from '@clio/core';
import {
  appendExecutionTranscriptEvent,
  type ExecutionTranscriptEvent,
} from './LiveExecutionEvents.js';

export interface SemanticFeedHooks {
  setSemanticEvents?: (
    n: SemanticEventPayload[] | ((p: SemanticEventPayload[]) => SemanticEventPayload[]),
  ) => void;
  semanticFeedCap?: number;
  setExecutionEvents?: (
    n: ExecutionTranscriptEvent[] | ((p: ExecutionTranscriptEvent[]) => ExecutionTranscriptEvent[]),
  ) => void;
}

export function applySemanticFeedEvent(
  type: string | undefined,
  payload: Record<string, unknown>,
  hooks: SemanticFeedHooks,
): boolean {
  if (type !== 'semantic.event') return false;
  const event = payload as unknown as SemanticEventPayload;
  appendExecutionTranscriptEvent(type, payload, hooks);
  if (typeof event.event_id === 'string' && hooks.setSemanticEvents) {
    hooks.setSemanticEvents((prev) =>
      appendUniqueSemanticEvent(prev, event, hooks.semanticFeedCap ?? 500),
    );
  }
  return true;
}

export function appendUniqueSemanticEvent(
  prev: SemanticEventPayload[],
  event: SemanticEventPayload,
  cap: number,
): SemanticEventPayload[] {
  if (prev.some((existing) => existing.event_id === event.event_id)) return prev;
  const next = [...prev, event];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
