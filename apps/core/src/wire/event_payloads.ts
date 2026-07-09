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

/**
 * `session.updated` — clio publishes the FULL Session object, flat
 * (`payload=Session(**sess.to_wire()).model_dump(exclude_none=True)`,
 * routes/sessions.py). It is an authoritative snapshot keyed by `id` —
 * NOT the `{session_id, changed_fields}` diff this type used to claim
 * (that shape only ever existed in the emulator; #232). Consumers that
 * still tolerate the legacy diff should read `changed_fields` through
 * the loose envelope, not through this type.
 */
export type SessionUpdatedPayload = Session;

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

/**
 * `session.compacted` — keys per the clio server (routes/sessions.py
 * `/compact` publish; #232). The previous
 * `{session_id, summary, compacted_count, auto}` shape had ZERO overlap
 * with what the server sends. `session_id` rides the event envelope /
 * per-session stream, not this payload.
 */
export interface SessionCompactedPayload {
  event_id: string;
  archived_count: number;
  summary_chars: number;
  summary_message_id: string;
  version: number;
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

/**
 * `message.part.completed` — clio turn.py `_close_streamed_part`. Beyond the
 * ids, clio sends the vendor fields the store already depends on:
 * `final_text` is the clean, complete text a client must use to replace its
 * buffered deltas (and, for batch providers that emit no `part.delta`
 * chunks, the ONLY carrier of the text); `turn_id` links the part to its
 * turn (the user message id); `stream_source` distinguishes live streaming
 * from replay/reload.
 */
export interface MessagePartCompletedPayload {
  message_id: string;
  part_id: string;
  final_text?: string;
  turn_id?: string;
  stream_source?: string;
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
 * text/thinking parts; tool_call deltas accumulate JSON-input fragments
 * under `input_json_append` (this type used to transpose it as
 * `json_input_append`, a key nothing on the wire ever sent; #232).
 */
export interface PartDelta {
  text_append?: string;
  input_json_append?: string;
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

/**
 * `permission.resolved` — action vocabulary per clio permission_gate.py:
 * allow / deny / allow_session / allow_workspace ('approve' was never a
 * wire value; #232).
 */
export interface PermissionResolvedPayload {
  permission_id: string;
  action: 'allow' | 'deny' | 'allow_session' | 'allow_workspace';
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
 * `session.cleared` — the `/clear` backend command wiped the session
 * ledger (policy-guarded, SPEC §7.3a). Carries only the session id.
 */
export interface SessionClearedPayload {
  session_id: string;
}

/**
 * `session.undo` / `session.rewind` — a rollback was committed (SPEC §6.2 /
 * §7.3a). Emitted after the per-message `message.deleted` events and before
 * the authoritative `session.updated`. For `undo`, `target_message_id` is
 * `""` and `include_target` is `false`.
 */
export interface SessionRollbackPayload {
  session_id: string;
  deleted_message_ids: string[];
  target_message_id: string;
  include_target: boolean;
  [k: string]: unknown;
}

/**
 * `message.deleted` — a message was removed (SPEC §7.3a). `operation` is
 * `undo` | `rewind` on a rollback; absent for a direct delete.
 */
export interface MessageDeletedPayload {
  message_id: string;
  session_id: string;
  operation?: 'undo' | 'rewind' | string;
  [k: string]: unknown;
}

/**
 * `file.diff.applied` / `file.diff.rejected` / `file.diff.write_failed` —
 * the diff apply lifecycle (SPEC §6.10 / §7.3a). `error` is present only on
 * `write_failed`.
 */
export interface FileDiffAppliedPayload {
  session_id: string;
  path: string;
  part_id: string;
  message_id: string;
  error?: string;
  [k: string]: unknown;
}

/**
 * `turn.retry_requested` / `.retry_running` / `.retry_completed` /
 * `.retry_failed` / `.retry_cancelled` — the retry lifecycle (SPEC §6.24).
 * The payload is the full flat TurnAttempt; kept as an open record so the
 * wire layer does not pin the attempt shape.
 */
export interface TurnRetryPayload {
  [k: string]: unknown;
}

/**
 * `OpaqueEventPayload` — vendor / opaque event payloads the client tolerates
 * but does not model: `arc.op`, `agent.reasoning.delta`, `subagent.*`,
 * `tool.selection.invalid`, `context.file.*`, the memory-tool audit sextet,
 * and every spec-only `mcp.*` / `file.changed` / `diff.generated` /
 * `session.agent_routed` / `workspace.updated` type. House style: a loose
 * record with a trailing index signature.
 */
export type OpaqueEventPayload = Record<string, unknown>;
