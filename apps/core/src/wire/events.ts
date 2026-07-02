import type {
  ContextFrameEventPayload,
  CostUpdatedPayload,
  LmProviderChangedPayload,
  LmProviderFailedPayload,
  MemoryCompactedPayload,
  MessageCompletedPayload,
  MessageCreatedPayload,
  MessageErrorPayload,
  MessagePartAddedPayload,
  MessagePartCompletedPayload,
  MessagePartDeltaPayload,
  NotificationPayload,
  PermissionRequestedPayload,
  PermissionResolvedPayload,
  SemanticEventPayload,
  ServerConnectedPayload,
  ServerDisposedPayload,
  SessionCompactedPayload,
  SessionCreatedPayload,
  SessionDeletedPayload,
  SessionSnapshotPayload,
  SessionStatusChangedPayload,
  SessionSummarizedPayload,
  SessionUpdatedPayload,
  ToolCallCompletedPayload,
  ToolCallProgressPayload,
  ToolCallStartedPayload,
  TranscriptActionAddedPayload,
  TranscriptCallResultDeltaPayload,
  TranscriptStateUpdatedPayload,
  TranscriptTextDeltaPayload,
  TranscriptTraceDeltaPayload,
  TranscriptTurnCompletedPayload,
  TranscriptTurnStartedPayload,
  UserQuestionEventPayload,
} from './event_payloads.js';

export * from './event_payloads.js';

/**
 * SSE envelope shape per `contract/SPEC.md` §7.2.
 *
 *   event: <event_type>
 *   id: <monotonic event id>
 *   data: { "type": "<event_type>", "occurred_at": "...", "payload": { ... } }
 *
 * The `payload` key was previously named `data` in our harness build —
 * that was wrong against a real `clio-agent-gact` server. The real wire
 * uses `payload`, with the redundant top-level `type` carrying the same
 * value as the `event:` line.
 */
export interface EventEnvelope<T = unknown> {
  type: string;
  occurred_at: string;
  payload: T;
}

/* -------------------- discriminated union -------------------- */

export type GactEvent =
  | (EventEnvelope<ServerConnectedPayload> & { type: 'server.connected' })
  | (EventEnvelope<{}> & { type: 'server.heartbeat' })
  | (EventEnvelope<ServerDisposedPayload> & { type: 'server.disposed' })
  | (EventEnvelope<SessionCreatedPayload> & { type: 'session.created' })
  | (EventEnvelope<SessionUpdatedPayload> & { type: 'session.updated' })
  | (EventEnvelope<SessionDeletedPayload> & { type: 'session.deleted' })
  | (EventEnvelope<SessionStatusChangedPayload> & { type: 'session.status_changed' })
  | (EventEnvelope<SessionSummarizedPayload> & { type: 'session.summarized' })
  | (EventEnvelope<SessionCompactedPayload> & { type: 'session.compacted' })
  | (EventEnvelope<SessionSnapshotPayload> & { type: 'session.snapshot' })
  | (EventEnvelope<MessageCreatedPayload> & { type: 'message.created' })
  | (EventEnvelope<MessagePartAddedPayload> & { type: 'message.part.added' })
  | (EventEnvelope<MessagePartDeltaPayload> & { type: 'message.part.delta' })
  | (EventEnvelope<MessagePartCompletedPayload> & { type: 'message.part.completed' })
  | (EventEnvelope<MessageCompletedPayload> & { type: 'message.completed' })
  | (EventEnvelope<MessageErrorPayload> & { type: 'message.error' })
  | (EventEnvelope<ToolCallStartedPayload> & { type: 'tool.call.started' })
  | (EventEnvelope<ToolCallProgressPayload> & { type: 'tool.call.progress' })
  | (EventEnvelope<ToolCallCompletedPayload> & { type: 'tool.call.completed' })
  | (EventEnvelope<PermissionRequestedPayload> & { type: 'permission.requested' })
  | (EventEnvelope<PermissionResolvedPayload> & { type: 'permission.resolved' })
  | (EventEnvelope<CostUpdatedPayload> & { type: 'cost.updated' })
  | (EventEnvelope<SemanticEventPayload> & { type: 'semantic.event' })
  | (EventEnvelope<TranscriptTurnStartedPayload> & { type: 'turn.started' })
  | (EventEnvelope<TranscriptTraceDeltaPayload> & { type: 'turn.trace.delta' })
  | (EventEnvelope<TranscriptTextDeltaPayload> & { type: 'turn.text.delta' })
  | (EventEnvelope<TranscriptActionAddedPayload> & { type: 'turn.action.added' })
  | (EventEnvelope<TranscriptCallResultDeltaPayload> & { type: 'call.result.delta' })
  | (EventEnvelope<TranscriptTurnCompletedPayload> & { type: 'turn.completed' })
  | (EventEnvelope<TranscriptStateUpdatedPayload> & { type: 'state.updated' })
  | (EventEnvelope<ContextFrameEventPayload> & { type: 'context.frame.created' })
  | (EventEnvelope<ContextFrameEventPayload> & { type: 'context.frame.completed' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.created' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.answered' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.cancelled' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.resumed' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.expired' })
  | (EventEnvelope<LmProviderChangedPayload> & { type: 'lm.provider.changed' })
  | (EventEnvelope<LmProviderFailedPayload> & { type: 'lm.provider.failed' })
  | (EventEnvelope<MemoryCompactedPayload> & { type: 'memory.compacted' })
  | (EventEnvelope<NotificationPayload> & { type: 'notification' });

/**
 * Subset of event names the chat shell currently reduces. Other event
 * types still arrive on the SSE feed (e.g. `tool.call.*`, `cost.updated`)
 * and are tolerated but not acted on yet.
 */
export const RELEVANT_EVENTS = [
  'server.connected',
  'server.heartbeat',
  'session.created',
  'session.updated',
  'session.deleted',
  'session.status_changed',
  'session.summarized',
  'session.compacted',
  'session.snapshot',
  'message.created',
  'message.part.added',
  'message.part.delta',
  'message.part.completed',
  'message.completed',
  'message.error',
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
  'context.frame.created',
  'context.frame.completed',
  'user_question.created',
  'user_question.answered',
  'user_question.cancelled',
  'user_question.resumed',
  'user_question.expired',
  'lm.provider.changed',
  'lm.provider.failed',
  'memory.compacted',
  'notification',
] as const;
