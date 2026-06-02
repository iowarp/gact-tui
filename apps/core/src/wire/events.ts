import type {
  ErrorInfo,
  Message,
  Part,
  PermissionRequest,
  Session,
  SessionStatus,
} from './types.js';

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
  /**
   * Structured error envelope when the turn did NOT produce a normal
   * assistant reply. Verified against live clio (develop @ 176518d): when
   * a `pre_message` hook blocks a turn, clio emits `message.completed` with
   * `stop_reason: "blocked"` and this `error_info` — and it targets the
   * USER message id (no assistant message is ever created). Matches the
   * `ErrorInfo` shape in types.ts. */
  error_info?: ErrorInfo;
}

/**
 * Per-session semantic execution event (clio `x_clio_semantic_events`).
 * Published over the SAME SSE stream as the plain `tool.call.*` /
 * `permission.requested` events, under SSE type `semantic.event`, with the
 * envelope `{type, occurred_at, payload: <this dict>}`.
 *
 * This is a READ-ONLY observability trace — the plain events already drive
 * the transcript/permission UI, so semantic events must NOT create
 * transcript messages, parts, or toasts. They feed the Inspector timeline.
 *
 * NOTE on redaction: `actor` / `subject` / `blueprint` / `provider` /
 * `payload` are free-form dicts whose string values may be the literal
 * sentinel `"[redacted]:N chars"`. Those sentinels must never be rendered
 * as content. `event_id` / `status` / `summary` / `occurred_at` and the
 * id linkage fields are never redacted. */
export interface SemanticEventPayload {
  schema_version?: string;
  event_id: string;
  event_type: string;
  session_id?: string;
  workspace_id?: string;
  trace_id?: string;
  /** The turn this event belongs to. clio sets this to the USER message id. */
  turn_id?: string;
  span_id?: string;
  parent_span_id?: string;
  status?: 'started' | 'running' | 'completed' | 'failed' | 'blocked' | string;
  summary?: string;
  /** Free-form dicts — string values may be redaction sentinels. */
  actor?: Record<string, unknown>;
  subject?: Record<string, unknown>;
  blueprint?: Record<string, unknown>;
  provider?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  live_observed?: boolean;
  detail_level?: string;
  occurred_at?: string;
  [k: string]: unknown;
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
  | (EventEnvelope<SemanticEventPayload> & { type: 'semantic.event' })
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
  'semantic.event',
  'notification',
] as const;
