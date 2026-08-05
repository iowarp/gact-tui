import type {
  ContextFrameEventPayload,
  CostUpdatedPayload,
  FileDiffAppliedPayload,
  LmProviderChangedPayload,
  LmProviderFailedPayload,
  MessageCompletedPayload,
  MessageCreatedPayload,
  MessageDeletedPayload,
  MessageErrorPayload,
  MessagePartAddedPayload,
  MessagePartCompletedPayload,
  MessagePartDeltaPayload,
  NotificationPayload,
  OpaqueEventPayload,
  PermissionRequestedPayload,
  PermissionResolvedPayload,
  SemanticEventPayload,
  ServerConnectedPayload,
  ServerDisposedPayload,
  SessionClearedPayload,
  SessionCompactedPayload,
  SessionCreatedPayload,
  SessionDeletedPayload,
  SessionRollbackPayload,
  SessionSnapshotPayload,
  SessionStatusChangedPayload,
  SessionSummarizedPayload,
  SessionUpdatedPayload,
  ToolCallCompletedPayload,
  ToolCallProgressPayload,
  ToolCallStartedPayload,
  TranscriptStateUpdatedPayload,
  TranscriptTurnCompletedPayload,
  TranscriptTurnStartedPayload,
  TurnRetryPayload,
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
  // -- server / connection --
  | (EventEnvelope<ServerConnectedPayload> & { type: 'server.connected' })
  | (EventEnvelope<{}> & { type: 'server.heartbeat' })
  | (EventEnvelope<ServerDisposedPayload> & { type: 'server.disposed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'workspace.updated' })
  // -- session lifecycle --
  | (EventEnvelope<SessionCreatedPayload> & { type: 'session.created' })
  | (EventEnvelope<SessionUpdatedPayload> & { type: 'session.updated' })
  | (EventEnvelope<SessionDeletedPayload> & { type: 'session.deleted' })
  | (EventEnvelope<SessionStatusChangedPayload> & { type: 'session.status_changed' })
  | (EventEnvelope<SessionSummarizedPayload> & { type: 'session.summarized' })
  | (EventEnvelope<SessionCompactedPayload> & { type: 'session.compacted' })
  | (EventEnvelope<SessionClearedPayload> & { type: 'session.cleared' })
  | (EventEnvelope<SessionSnapshotPayload> & { type: 'session.snapshot' })
  | (EventEnvelope<SessionRollbackPayload> & { type: 'session.undo' })
  | (EventEnvelope<SessionRollbackPayload> & { type: 'session.rewind' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'session.agent_routed' })
  // -- messages / parts --
  | (EventEnvelope<MessageCreatedPayload> & { type: 'message.created' })
  | (EventEnvelope<MessagePartAddedPayload> & { type: 'message.part.added' })
  // Same payload as part.added — the part is REPLACED in place by id (clean
  // delegation wire: the terminal expert_handoff updates the started part).
  | (EventEnvelope<MessagePartAddedPayload> & { type: 'message.part.updated' })
  | (EventEnvelope<MessagePartDeltaPayload> & { type: 'message.part.delta' })
  | (EventEnvelope<MessagePartCompletedPayload> & { type: 'message.part.completed' })
  | (EventEnvelope<MessageCompletedPayload> & { type: 'message.completed' })
  | (EventEnvelope<MessageDeletedPayload> & { type: 'message.deleted' })
  | (EventEnvelope<MessageErrorPayload> & { type: 'message.error' })
  // -- tools --
  | (EventEnvelope<ToolCallStartedPayload> & { type: 'tool.call.started' })
  | (EventEnvelope<ToolCallProgressPayload> & { type: 'tool.call.progress' })
  | (EventEnvelope<ToolCallCompletedPayload> & { type: 'tool.call.completed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'tool.selection.invalid' })
  // -- permissions --
  | (EventEnvelope<PermissionRequestedPayload> & { type: 'permission.requested' })
  | (EventEnvelope<PermissionResolvedPayload> & { type: 'permission.resolved' })
  // -- subagents --
  | (EventEnvelope<OpaqueEventPayload> & { type: 'subagent.started' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'subagent.completed' })
  // -- cost / semantic --
  | (EventEnvelope<CostUpdatedPayload> & { type: 'cost.updated' })
  | (EventEnvelope<SemanticEventPayload> & { type: 'semantic.event' })
  // -- turn lifecycle (dual-namespace) --
  | (EventEnvelope<TranscriptTurnStartedPayload> & { type: 'turn.started' })
  | (EventEnvelope<TranscriptTurnCompletedPayload> & { type: 'turn.completed' })
  | (EventEnvelope<TranscriptStateUpdatedPayload> & { type: 'state.updated' })
  // -- turn retry --
  | (EventEnvelope<TurnRetryPayload> & { type: 'turn.retry_requested' })
  | (EventEnvelope<TurnRetryPayload> & { type: 'turn.retry_running' })
  | (EventEnvelope<TurnRetryPayload> & { type: 'turn.retry_completed' })
  | (EventEnvelope<TurnRetryPayload> & { type: 'turn.retry_failed' })
  | (EventEnvelope<TurnRetryPayload> & { type: 'turn.retry_cancelled' })
  // -- context files / frames --
  | (EventEnvelope<OpaqueEventPayload> & { type: 'context.file.added' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'context.file.removed' })
  | (EventEnvelope<ContextFrameEventPayload> & { type: 'context.frame.created' })
  | (EventEnvelope<ContextFrameEventPayload> & { type: 'context.frame.completed' })
  // -- diffs --
  | (EventEnvelope<FileDiffAppliedPayload> & { type: 'file.diff.applied' })
  | (EventEnvelope<FileDiffAppliedPayload> & { type: 'file.diff.rejected' })
  | (EventEnvelope<FileDiffAppliedPayload> & { type: 'file.diff.write_failed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'file.changed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'diff.generated' })
  // -- memory (search + tool audit sextet) --
  | (EventEnvelope<OpaqueEventPayload> & { type: 'memory.search.completed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'memory_search_sessions.completed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'memory_search_sessions.denied' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'memory_read_session_summary.completed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'memory_read_session_summary.denied' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'memory_read_context_frame.completed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'memory_read_context_frame.denied' })
  // -- arc / reasoning --
  | (EventEnvelope<OpaqueEventPayload> & { type: 'arc.op' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'agent.reasoning.delta' })
  // -- lm provider --
  | (EventEnvelope<LmProviderChangedPayload> & { type: 'lm.provider.changed' })
  | (EventEnvelope<LmProviderFailedPayload> & { type: 'lm.provider.failed' })
  // -- mcp --
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.server.error' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.server.reconnected' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.server.status' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.tools.list_changed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.prompts.list_changed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.resources.list_changed' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.resources.updated' })
  | (EventEnvelope<OpaqueEventPayload> & { type: 'mcp.log' })
  // -- user questions --
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.created' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.answered' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.cancelled' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.resumed' })
  | (EventEnvelope<UserQuestionEventPayload> & { type: 'user_question.expired' })
  // -- misc --
  | (EventEnvelope<NotificationPayload> & { type: 'notification' });

/**
 * The canonical wire event-type vocabulary, machine-checked against
 * `contract/SPEC.md` §7.7 (normative). Two guards keep this array and the
 * `GactEvent` union in lockstep at compile time:
 *
 *   - `satisfies readonly GactEvent['type'][]` forbids any entry that is
 *     NOT a union member (a typo or a removed arm fails typecheck here).
 *   - the `AssertNever` alias below forbids any union member MISSING from
 *     the array (adding a union arm without listing it fails typecheck).
 *
 * `apps/core/tests/spec_vocabulary.test.ts` then asserts set-equality with
 * the §7.7 block, and `apps/web` asserts `LIVE_SSE_EVENT_TYPES ⊆` this.
 * Alphabetical by namespace.
 */
export const WIRE_EVENT_TYPES = [
  'agent.reasoning.delta',
  'arc.op',
  'context.file.added',
  'context.file.removed',
  'context.frame.completed',
  'context.frame.created',
  'cost.updated',
  'diff.generated',
  'file.changed',
  'file.diff.applied',
  'file.diff.rejected',
  'file.diff.write_failed',
  'lm.provider.changed',
  'lm.provider.failed',
  'mcp.log',
  'mcp.prompts.list_changed',
  'mcp.resources.list_changed',
  'mcp.resources.updated',
  'mcp.server.error',
  'mcp.server.reconnected',
  'mcp.server.status',
  'mcp.tools.list_changed',
  'memory.search.completed',
  'memory_read_context_frame.completed',
  'memory_read_context_frame.denied',
  'memory_read_session_summary.completed',
  'memory_read_session_summary.denied',
  'memory_search_sessions.completed',
  'memory_search_sessions.denied',
  'message.completed',
  'message.created',
  'message.deleted',
  'message.error',
  'message.part.added',
  'message.part.completed',
  'message.part.delta',
  'message.part.updated',
  'notification',
  'permission.requested',
  'permission.resolved',
  'semantic.event',
  'server.connected',
  'server.disposed',
  'server.heartbeat',
  'session.agent_routed',
  'session.cleared',
  'session.compacted',
  'session.created',
  'session.deleted',
  'session.rewind',
  'session.snapshot',
  'session.status_changed',
  'session.summarized',
  'session.undo',
  'session.updated',
  'state.updated',
  'subagent.completed',
  'subagent.started',
  'tool.call.completed',
  'tool.call.progress',
  'tool.call.started',
  'tool.selection.invalid',
  'turn.completed',
  'turn.retry_cancelled',
  'turn.retry_completed',
  'turn.retry_failed',
  'turn.retry_requested',
  'turn.retry_running',
  'turn.started',
  'user_question.answered',
  'user_question.cancelled',
  'user_question.created',
  'user_question.expired',
  'user_question.resumed',
  'workspace.updated',
] as const satisfies readonly GactEvent['type'][];

/**
 * Compile-time exhaustiveness guard: if any `GactEvent['type']` is absent
 * from `WIRE_EVENT_TYPES`, `Exclude<...>` resolves to that missing string
 * literal (not `never`) and this alias fails to type-check.
 */
type AssertNever<T extends never> = T;
type _WireEventTypesExhaustive = AssertNever<
  Exclude<GactEvent['type'], (typeof WIRE_EVENT_TYPES)[number]>
>;
