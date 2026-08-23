/**
 * Session lifecycle status — clio types.py `Session.status` (#232).
 */
export type SessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_permission'
  | 'waiting_user'
  | 'error'
  | 'cancelled'
  /**
   * @deprecated Never emitted by clio (`Session.status` has no 'finished').
   * The `LiveSessionEvents` terminal-status check this was originally kept
   * for was deleted with the rest of the orphaned wire/Live* island
   * (gact-tui#365) — a repo-wide grep found NO current consumer of this
   * literal anywhere in apps/ (web or core). Kept defensively pending a
   * dedicated removal decision rather than deleted in passing here; see #232.
   */
  | 'finished';

/** clio types.py `Session.edit_mode` — 'architect' was never a wire value
 *  (it is a session `mode`, not an edit_mode); 'patch' was missing. */
export type EditMode = 'diff' | 'whole' | 'patch' | string;
/** clio types.py `Session.routing_mode` — 'manual' was invented; the wire
 *  vocabulary is auto/chat/experts/reasoning_only. */
export type RoutingMode = 'auto' | 'chat' | 'experts' | 'reasoning_only' | string;
export type SessionMode = 'chat' | 'plan' | string;

export interface Session {
  id: string;
  title: string;
  status: SessionStatus;
  workspace_id?: string;
  parent_session_id?: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
  tokens_input?: number;
  tokens_output?: number;
  cost_usd?: number;
  mode?: SessionMode;
  edit_mode?: EditMode;
  routing_mode?: RoutingMode;
  metadata?: Record<string, unknown>;
}

export type PermissionScope = 'once' | 'session' | 'always_tool' | 'always_server';

export interface PermissionRequest {
  id: string;
  session_id: string;
  tool_name: string;
  tool_call?: {
    input?: Record<string, unknown>;
  };
  risk?: 'low' | 'medium' | 'high';
  reason?: string;
  created_at: string;
  /** Lifecycle status from the backend permission ledger: 'pending' (awaiting the
   *  user), 'resolved' (already answered), or 'auto_approved'. A reload surfaces
   *  ONLY a genuinely-pending request as the permission card, so an already-answered
   *  permission is never re-prompted (C7). Absent on older backends. */
  status?: 'pending' | 'resolved' | 'auto_approved' | string;
}

/** One recorded retry of a turn (x_clio_retry_attempts). Returned by
 * POST /v1/sessions/{id}/messages/{mid}/retry and GET .../attempts; also
 * the payload of the `turn.retry_*` SSE events. */
export interface TurnAttempt {
  id: string;
  session_id: string;
  source_message_id: string;
  status: 'recorded' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  created_at: string;
  updated_at: string;
  notes?: string;
  model?: { provider_id?: string; model_id?: string };
  warning?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Per-session "context file" tracked by clio-agent develop at
 * /v1/sessions/{sid}/context/files. Each row is a file the agent
 * has been asked to keep in context, with an optional mode (read/
 * edit) and provenance metadata.
 */
export interface ContextFile {
  path: string;
  mode?: 'read' | 'edit' | string;
  size?: number;
  last_modified?: string;
  language?: string;
  added_at?: string;
}

/**
 * Ask-user question per clio-agent develop #380 (orchestrator
 * ask-user resume semantics). The orchestrator may pause a turn
 * and emit one of these for the user to answer before continuing.
 */
export interface UserQuestionOption {
  label: string;
  value?: string;
  description?: string;
}

export interface UserQuestion {
  id: string;
  session_id: string;
  prompt: string;
  status: 'pending' | 'answered' | 'cancelled' | 'expired';
  kind: 'freeform' | 'choice' | 'confirmation';
  options?: UserQuestionOption[];
  created_at: string;
  updated_at: string;
  expires_at?: string;
  source?: string;
  turn_id?: string;
  attempt_id?: string;
  answer?: string;
  selected_options?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Per-session task entry per clio-agent develop /v1/sessions/{sid}/tasks -
 * lightweight TODO list the agent or user can populate during a turn.
 */
export interface SessionTask {
  id: string;
  session_id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}
