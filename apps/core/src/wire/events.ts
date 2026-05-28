import type { Message, Part, PermissionRequest, Session, SessionStatus } from './types.js';

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

/* -------------------- v0.2 payload shapes -------------------- */

export interface ServerConnectedPayload {
  server_version?: string;
}

export interface ServerDisposedPayload {
  reason?: string;
}

export interface SessionCreatedPayload {
  session: Session;
}

export interface SessionUpdatedPayload {
  session_id: string;
  changed_fields: string[];
}

export interface SessionDeletedPayload {
  session_id: string;
}

export interface SessionStatusChangedPayload {
  session_id: string;
  status: SessionStatus;
  prev_status?: SessionStatus;
}

export interface SessionSummarizedPayload {
  session_id: string;
  summary: string;
}

export interface SessionCompactedPayload {
  session_id: string;
  summary: string;
  compacted_count: number;
  auto: boolean;
}

export interface MessageCreatedPayload {
  message: Message;
}

export interface MessagePartAddedPayload {
  message_id: string;
  part: Part;
}

export interface MessagePartDeltaPayload {
  message_id: string;
  part_id: string;
  delta: PartDelta;
}

export interface MessagePartCompletedPayload {
  message_id: string;
  part_id: string;
}

export interface MessageCompletedPayload {
  message_id: string;
  stop_reason: string;
  tokens?: { input?: number; output?: number; total?: number };
  cost_usd?: number;
}

export interface MessageErrorPayload {
  message_id: string;
  error: { error: string; message: string; recoverable?: boolean; details?: unknown };
}

/**
 * Per SPEC §7.2, the streaming part delta carries `text_append` for
 * text/thinking parts; tool_call deltas accumulate JSON-input fragments.
 */
export interface PartDelta {
  text_append?: string;
  json_input_append?: string;
  [k: string]: unknown;
}

export interface ToolCallStartedPayload {
  call_id: string;
  tool_name: string;
  server_id?: string;
}

export interface ToolCallProgressPayload {
  call_id: string;
  progress: number;
  total?: number;
  message?: string;
}

export interface ToolCallCompletedPayload {
  call_id: string;
  is_error: boolean;
}

export interface PermissionRequestedPayload {
  permission: PermissionRequest;
}

export interface PermissionResolvedPayload {
  permission_id: string;
  action: 'approve' | 'deny';
}

export interface CostUpdatedPayload {
  session_id: string;
  tokens?: { input?: number; output?: number };
  cost_usd: number;
}

export interface NotificationPayload {
  level: 'info' | 'warning' | 'error';
  title: string;
  body?: string;
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
  'notification',
] as const;
