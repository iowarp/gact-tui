import type {
  ErrorInfo,
  Message,
  Part,
  PermissionRequest,
  Session,
  SessionStatus,
  UserQuestion,
} from './types.js';

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
   * `ErrorInfo` shape in types.ts.
   */
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
 * id linkage fields are never redacted.
 */
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

export interface TranscriptTurnStartedPayload {
  turn_id: string;
  agent_id: string;
  parent_call_id?: string;
  [k: string]: unknown;
}

export interface TranscriptTraceDeltaPayload {
  turn_id: string;
  trace_id: string;
  trace_kind: 'model_aux' | string;
  text_append: string;
  agent_id?: string;
  part_id?: string;
  tokens?: number;
  [k: string]: unknown;
}

export interface TranscriptTextDeltaPayload {
  turn_id: string;
  agent_id?: string;
  part_id?: string;
  field: 'thought' | 'answer';
  text_append: string;
  tokens?: number;
  [k: string]: unknown;
}

export interface TranscriptActionAddedPayload {
  turn_id: string;
  action: TranscriptAction;
  [k: string]: unknown;
}

export type TranscriptAction =
  | TranscriptAgentCallAction
  | TranscriptToolCallAction
  | TranscriptReturnAction
  | (Record<string, unknown> & { kind?: string; type?: string; call_id?: string });

export interface TranscriptAgentCallAction {
  kind: 'agent_call';
  call_id: string;
  target_agent: string;
  prompt?: string;
  tokens?: number;
  [k: string]: unknown;
}

export interface TranscriptToolCallAction {
  kind: 'tool_call';
  call_id: string;
  tool_name: string;
  input?: unknown;
  thought?: string;
  tokens?: number;
  [k: string]: unknown;
}

export interface TranscriptReturnAction {
  kind: 'return';
  call_id: string;
  target_agent?: string;
  parent_agent?: string;
  text?: string;
  response?: string;
  summary?: string;
  tokens?: number;
  [k: string]: unknown;
}

export interface TranscriptCallResultDeltaPayload {
  call_id: string;
  content_type?: string;
  text_append?: string;
  value_append?: unknown;
  tokens?: number;
  [k: string]: unknown;
}

export interface TranscriptTurnCompletedPayload {
  turn_id: string;
  tokens?: { input?: number; output?: number; total?: number };
  [k: string]: unknown;
}

export interface TranscriptStateUpdatedPayload {
  turn_id: string;
  value: Record<string, unknown>;
  visibility: 'hidden' | string;
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

/**
 * `session.snapshot` — authoritative session state pushed right after
 * `server.connected` so a (re)connecting client can reconcile without a fetch
 * (SPEC §7.1). `authoritative: true` means this supersedes any optimistic
 * status the client is holding.
 */
export interface SessionSnapshotPayload {
  session_id: string;
  status: SessionStatus;
  updated_at?: string;
  authoritative?: boolean;
}

/**
 * `context.frame.created` / `context.frame.completed` — a per-turn
 * assembled-context snapshot was opened/finished (SPEC §6.9, vendor
 * `x_clio_context_frames`). The event is a lightweight signal; the full frame
 * (items with `kind`/`included`/`reason`/`tokens_estimated`) is fetched via
 * `GET /v1/sessions/{id}/context/frames`. Frame kept loose here so the wire
 * layer does not depend on the client-layer ContextFrame type.
 */
export interface ContextFrameEventPayload {
  session_id: string;
  frame_id?: string;
  frame?: Record<string, unknown>;
  [k: string]: unknown;
}

/**
 * `user_question.{created,resumed,answered,cancelled,expired}` — the ask-user
 * lifecycle (SPEC §6.23 / §7.3, vendor). `created`/`resumed` carry the active
 * question; the terminal events carry the resolution. clio may flatten the
 * question fields or nest them under `question`, so consumers normalise via a
 * `userQuestionFromPayload` helper.
 */
export interface UserQuestionEventPayload {
  session_id?: string;
  question_id?: string;
  question?: UserQuestion;
  status?: UserQuestion['status'];
  [k: string]: unknown;
}

/**
 * `lm.provider.changed` — the active LM provider/model was swapped via
 * `/v1/providers/lm` (SPEC §7.3a). Consumers read `provider_id` + `model_id`.
 */
export interface LmProviderChangedPayload {
  provider_id?: string;
  model_id?: string;
  [k: string]: unknown;
}

/** `lm.provider.failed` — a provider/model config attempt failed (SPEC §7.3a). */
export interface LmProviderFailedPayload {
  provider_id?: string;
  model_id?: string;
  error?: string;
  message?: string;
  [k: string]: unknown;
}

/**
 * `memory.compacted` — the memory subsystem compacted stored session context
 * (SPEC §7, vendor). Distinct from `session.compacted`, which is the
 * transcript-level compaction that produces a compaction Part.
 */
export interface MemoryCompactedPayload {
  session_id: string;
  [k: string]: unknown;
}
