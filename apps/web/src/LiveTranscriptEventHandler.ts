/**
 * Per-event SSE pipeline: parse the data frame, track stream stats, run the
 * reducer, and schedule a reconcile when warranted. Exports
 * {@link createLiveTranscriptEventHandler} and {@link parseLiveEventData}.
 */
import type { ReduceHooks } from './LiveReducer.js';
import { reduce } from './LiveReducer.js';
import { shouldReconcileTranscriptAfterEvent } from './LiveSessionsModel.js';

export type LiveEventEnvelope = { type?: string; payload?: Record<string, unknown> };

export interface LiveTranscriptEventHandlerOptions {
  sessionId: string;
  reduceHooks: ReduceHooks;
  trackStreamEvent: (event: LiveEventEnvelope) => void;
  scheduleReconcile: () => void;
}

export function createLiveTranscriptEventHandler(options: LiveTranscriptEventHandlerOptions) {
  return (dataStr: string) => {
    const typed = parseLiveEventData(dataStr);
    if (!typed) return;
    options.trackStreamEvent(typed);
    reduce(typed, options.reduceHooks);
    if (shouldReconcileTranscriptAfterEvent(typed, options.sessionId)) {
      options.scheduleReconcile();
    }
  };
}

export function parseLiveEventData(dataStr: string): LiveEventEnvelope | null {
  try {
    return JSON.parse(dataStr) as LiveEventEnvelope;
  } catch {
    return null;
  }
}
