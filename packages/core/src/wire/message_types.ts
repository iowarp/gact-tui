export type Role = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Common fields on every Part per SPEC section 4.5: stable `id` within the
 * message, the `type` discriminator, and optional metadata. The harness build
 * omitted `id` and used wrong shapes for thinking / tool_result; the v0.9 cut
 * aligns to the spec.
 */
export interface PartBase {
  id?: string;
  metadata?: Record<string, unknown>;
}

export interface PartText extends PartBase {
  type: 'text';
  text: string;
}

export interface PartThinking extends PartBase {
  type: 'thinking';
  /** Spec uses `thinking`; we tolerate `text` for backward compat with the
   *  harness fixture build. New code should write `thinking`. */
  thinking?: string;
  text?: string;
  signature?: string;
}

export interface PartRedactedThinking extends PartBase {
  type: 'redacted_thinking';
  data: string;
  signature?: string;
}

/**
 * Image content. SPEC §4.5: clio sends **flat** `data`/`url`/`media_type`
 * (gated by `multimodal_image_parts`), NOT a nested `source` object. The
 * emulator/harness fixtures use the nested `source` form, so we accept both;
 * renderers prefer the flat fields and fall back to `source`.
 */
export interface PartImage extends PartBase {
  type: 'image';
  media_type?: string;
  data?: string; // base64
  url?: string;
  file_id?: string;
  /** Legacy nested form (emulator/harness fixtures). */
  source?: ImageSource;
}

export interface ImageSource {
  kind: 'base64' | 'url' | 'file_id';
  media_type?: string;
  data?: string;
  url?: string;
  file_id?: string;
}

/**
 * A source document the model may quote/cite (SPEC §4.5). `source` carries the
 * bytes (base64/url/file_id); `citations.enabled` toggles model-produced
 * citations against it.
 */
export interface PartDocument extends PartBase {
  type: 'document';
  source?: PartSource;
  title?: string;
  context?: string;
  citations?: PartCitations;
}

/** Source bytes for an image or document part (SPEC §4.5). */
export interface PartSource {
  kind: 'base64' | 'url' | 'file_id';
  media_type?: string;
  data?: string;
  url?: string;
  file_id?: string;
}

/** Whether the model should produce citations from a document part (SPEC §4.5). */
export interface PartCitations {
  enabled: boolean;
}

/**
 * MCP tool-call annotations (SPEC §4.5 tool_call) — behavioural hints the UI
 * uses to gate/label a call (e.g. read-only vs destructive). Open-ended: a
 * server may ship hints beyond the well-known four.
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
  [key: string]: unknown;
}

export interface PartToolCall extends PartBase {
  type: 'tool_call';
  /** Spec uses `call_id`; we accept legacy `id` for the harness path. */
  call_id?: string;
  tool_name: string;
  input?: Record<string, unknown>;
  server_id?: string;
  annotations?: ToolAnnotations;
}

export interface PartToolResult extends PartBase {
  type: 'tool_result';
  /** Spec uses `call_id`; we tolerate `tool_call_id` for harness compat. */
  call_id?: string;
  tool_call_id?: string;
  /**
   * Spec: recursive Part[]. The harness build produced a plain `output`
   * string; we accept either so existing fixtures keep rendering.
   */
  content?: Part[];
  output?: string;
  is_error?: boolean;
  /** v0.2 tool telemetry (capabilities.tool_telemetry). */
  cached?: boolean; // result came from a memory cache hit
  duration_ms?: number; // wall-clock ms including cache lookup
}

/**
 * Public capability reference for an MCP Apps 2026-01-26 view. The backing
 * CallToolResult (including private `_meta`) is deliberately absent: the host
 * resolves `data_ref` against its session-local registry and only the bound
 * iframe receives the private app payload.
 */
export interface PartMcpApp extends PartBase {
  type: 'mcp_app';
  app_instance_id: string;
  resource_uri: string;
  source_server: string;
  data_ref: string;
  mime_type: 'text/html;profile=mcp-app';
  height?: number;
}

/**
 * clio delegated a turn to a sub-session agent (SPEC §4.5 subagent_call). The
 * companion `subagent_result` arrives when the sub-session finishes.
 */
export interface PartSubagentCall extends PartBase {
  type: 'subagent_call';
  subsession_id?: string;
  agent_id?: string;
  prompt?: string;
  params?: Record<string, unknown>;
}

export interface PartSubagentResult extends PartBase {
  type: 'subagent_result';
  subsession_id?: string;
  summary?: string;
  final_message_id?: string;
}

/** A reference to an MCP resource (SPEC §4.5 resource_link). */
export interface PartResourceLink extends PartBase {
  type: 'resource_link';
  uri: string;
  name?: string;
  description?: string;
  mime_type?: string;
}

/** Inline MCP resource content (SPEC §4.5 resource). */
export interface PartResource extends PartBase {
  type: 'resource';
  uri: string;
  mime_type?: string;
  content?: Part[];
}

/** A user instruction bound to one exact immutable document artifact version. */
export interface PartArtifactReview extends PartBase {
  type: 'artifact_review';
  review_id: string;
  artifact_id: string;
  artifact_version: number;
  artifact_sha256: string;
  review_text: string;
  anchor: Record<string, unknown>;
}

export type FileDiffStatus = 'pending' | 'applied' | 'rejected' | 'apply_failed';
/** file_diff edit mode (SPEC §4.5) — same vocabulary as the session-level
 *  EditMode (diff/whole/patch) in session_types.ts, but scoped to one part. */
export type FileDiffEditMode = 'diff' | 'whole' | 'patch';

/**
 * Proposed file change. SPEC §4.5: clio sends `unified_diff` + `new_content`
 * (whole-file replacement the apply path writes) + `status`/`edit_mode` +
 * `lines_added`/`lines_removed`, NOT the v0.1 `before`/`after`/`applied`
 * triple. We keep the v0.1 fields so emulator/harness fixtures keep rendering;
 * the DiffPane prefers `unified_diff`/`new_content` and synthesizes from
 * `before`+`after` only when they are absent.
 */
export interface FileDiff extends PartBase {
  type: 'file_diff';
  path: string;
  unified_diff?: string;
  new_content?: string;
  status?: FileDiffStatus;
  edit_mode?: FileDiffEditMode;
  lines_added?: number;
  lines_removed?: number;
  language?: string | null;
  // v0.1 / fixture compat
  before?: string | null;
  after?: string | null;
  applied?: boolean;
}

/** A cited span backed by a source (SPEC §4.5 citation). */
export interface PartCitation extends PartBase {
  type: 'citation';
  text?: string;
  source?: CitationSource;
  text_range?: TextRange;
}

export interface CitationSource {
  type: 'document' | 'web' | 'resource';
  reference: string;
  location?: Record<string, unknown>;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface PartError extends PartBase {
  type: 'error';
  code: string;
  message: string;
  recoverable?: boolean;
}

export interface PartCompaction extends PartBase {
  type: 'compaction';
  summary: string;
  compacted_message_ids: string[];
  auto: boolean;
}

/** clio extension execution path on a routing decision (SPEC §4.5). */
export type ExecutionPath = 'fast' | 'expert_loop' | '';

/**
 * The orchestrator chose an agent for this turn (SPEC §4.5 routing_decision,
 * v0.2, capabilities.agent_routing). SHOULD be the first part of a routed
 * assistant message.
 */
export interface PartRoutingDecision extends PartBase {
  type: 'routing_decision';
  selected_agent: string;
  rationale?: string;
  confidence?: number; // 0..1
  heuristic: boolean; // true = deterministic keyword match; false = LM router
  /** clio extension: "fast" (deterministic tool template, no LM) | "expert_loop"
   *  (full expert tool-loop) | "" when N/A. */
  execution_path?: ExecutionPath;
}

/** clio delegated the turn to a sub-expert; `text` is a ready-made summary, the
 *  handoff detail rides in `metadata` (SPEC §4.5 expert_handoff). */
export interface PartExpertHandoff extends PartBase {
  type: 'expert_handoff';
  text?: string;
}

/** Inline ask-user prompt embedded in the transcript (SPEC §4.5 agent_question).
 *  The live lifecycle also arrives via the `user_question.*` SSE events. */
export interface PartAgentQuestion extends PartBase {
  type: 'agent_question';
  question?: AgentQuestion;
}

export interface AgentQuestion {
  id: string;
  prompt: string;
  status?: string;
  kind?: string;
  choices?: string[];
  [key: string]: unknown;
}

/** A retry marker emitted when clio re-attempts a failed turn (SPEC §4.5
 *  retry_attempt). */
export interface PartRetryAttempt extends PartBase {
  type: 'retry_attempt';
  retry_attempt?: RetryAttempt;
}

export interface RetryAttempt {
  attempt?: number;
  max_attempts?: number;
  reason?: string;
  [key: string]: unknown;
}

/**
 * Forward-compat escape hatch (SPEC §2 / §8.3): a Part whose `type` the client
 * does not recognise MUST be tolerated, not dropped. The known union below is
 * closed for clean discriminated narrowing; renderers cast an unmatched part to
 * `PartUnknown` in their fallback branch to render `type` + a raw preview.
 */
export interface PartUnknown extends PartBase {
  type: string;
  [key: string]: unknown;
}

/**
 * Run-handle render fields carried by every run-scoped part.
 *
 * Produced by `run_handle_fields()`
 * (clio-agent `gact/agents/spawn_placement.py:98`) and attached identically to
 * `background_exit` and `agent_message`, so they are modelled once.
 */
export interface RunHandleFields {
  /** Stable handle for the run; falls back to the task id. */
  handle_id?: string;
  /** Display label, e.g. `data #1`. */
  run_label?: string;
  /** Live state; falls back to the task status. */
  live_state?: string;
  /** Resolved host — `local`, or the host parsed out of a relay placement. */
  host?: string;
  /** Placement grammar, e.g. `local` or `relay:ares`. */
  placement?: string;
  agent_id?: string;
  parent_agent?: string;
  child_agent?: string;
}

/** Terminal outcome of a backgrounded run. Note `canceled` (one l) on the wire. */
export type BackgroundExitStatus = 'completed' | 'failed' | 'canceled';

/**
 * Emitted once per terminal background task, downstream of the exactly-once
 * consumption gate (clio-agent `gact/background_exit.py`, P2.14 / #1131).
 */
export interface PartBackgroundExit extends PartBase, RunHandleFields {
  type: 'background_exit';
  task_id?: string;
  job_id?: string;
  exit_status: BackgroundExitStatus;
  /** Present only when the terminal fold supplied one. */
  artifact_ref?: Record<string, unknown> | null;
  status?: string;
}

/** What was done to the child agent (clio-agent `gact/agent_messaging.py`). */
export type AgentMessageAction = 'queue' | 'steer' | 'wake' | 'supersede';

/**
 * Emitted when a message is delivered to a child agent — steer, queue, wake or
 * supersede (P2.11 / #1128).
 */
export interface PartAgentMessage extends PartBase, RunHandleFields {
  type: 'agent_message';
  message_action?: AgentMessageAction;
  /** Lifecycle stage, e.g. `message.queued`. */
  stage?: string;
  status?: string;
  text?: string;
}

export type Part =
  | PartText
  | PartThinking
  | PartRedactedThinking
  | PartImage
  | PartDocument
  | PartToolCall
  | PartToolResult
  | PartMcpApp
  | PartSubagentCall
  | PartSubagentResult
  | PartResourceLink
  | PartResource
  | PartArtifactReview
  | FileDiff
  | PartCitation
  | PartError
  | PartCompaction
  | PartRoutingDecision
  | PartExpertHandoff
  | PartAgentQuestion
  | PartRetryAttempt
  | PartBackgroundExit
  | PartAgentMessage;

export interface Message {
  id: string;
  session_id?: string;
  role: Role;
  parts: Part[];
  created_at?: string;
  updated_at?: string;
  model?: { provider_id?: string; model_id?: string } | null;
  tokens?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  cost_usd?: number;
  stop_reason?: string | null;
  error_info?: ErrorInfo | null;
  metadata?: Record<string, unknown>;
}

/**
 * Structured error envelope on a Message (SPEC §14.1). `error` is the taxonomy
 * code (e.g. `rate_limited`, `provider_unavailable`); `recoverable` gates a
 * regenerate affordance; `retry_after_s` hints an auto-retry UI (null/omitted
 * when unknown).
 */
export interface ErrorInfo {
  error: string;
  message: string;
  recoverable?: boolean;
  retry_after_s?: number | null;
  details?: Record<string, unknown>;
}
