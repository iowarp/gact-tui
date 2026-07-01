// Backoff ladder for SSE reconnects. Each step caps at 10s so we don't go
// silent for minutes after a few attempts; the user can still force-recover
// with the reconnect action.
export const LIVE_RECONNECT_BACKOFF_SECONDS = [1, 2, 5, 10, 10, 10] as const;

// Cap the semantic feed so a long-running session can't grow it without bound.
// It's an observability timeline, not the source of truth.
export const SEMANTIC_FEED_CAP = 500;

// SSE event types the live stream listens for. Several are forward-compatible:
// clio does not emit them today, but keeping handlers registered lets desktop
// light up when the backend starts sending them.
export const LIVE_SSE_EVENT_TYPES = [
  'server.connected',
  'server.heartbeat',
  'session.created',
  'session.updated',
  'session.deleted',
  'session.status_changed',
  'session.summarized',
  'session.compacted',
  'session.cleared',
  'message.created',
  'message.part.added',
  'message.part.delta',
  'message.part.completed',
  'message.completed',
  'message.error',
  'message.deleted',
  'tool.call.started',
  'tool.call.progress',
  'tool.call.completed',
  'permission.requested',
  'permission.resolved',
  'cost.updated',
  'semantic.event',
  'turn.started',
  'turn.trace.delta',
  'turn.text.delta',
  'turn.action.added',
  'call.result.delta',
  'turn.completed',
  'state.updated',
  'notification',
  'user_question.created',
  'user_question.answered',
  'user_question.cancelled',
  'user_question.expired',
  'user_question.resumed',
  'lm.provider.changed',
  'lm.provider.failed',
  'context.frame.created',
  'context.frame.completed',
  'context.file.added',
  'context.file.removed',
  'file.diff.applied',
  'file.diff.rejected',
  'file.diff.write_failed',
  'subagent.started',
  'subagent.completed',
  'memory.search.completed',
  'turn.retry_requested',
  'turn.retry_running',
  'turn.retry_completed',
  'turn.retry_failed',
  'turn.retry_cancelled',
] as const;

/** Union of every SSE event name the live stream listens for. The dispatch
 * registry in LiveReducer is keyed by this union, so adding a name above
 * without wiring a handler is a compile-time error. */
export type LiveEventType = (typeof LIVE_SSE_EVENT_TYPES)[number];
