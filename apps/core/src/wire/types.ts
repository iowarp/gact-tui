/**
 * Wire types for the GACT v0.2 contract.
 * Authoritative source: contract/SPEC.md in the repository root.
 *
 * This is a subset sufficient for the harness — full coverage lands as
 * post-harness work tracked in apps/PLAN.md.
 */

export type Role = 'user' | 'assistant' | 'system' | 'tool';

export type SessionStatus =
  | 'idle'
  | 'running'
  | 'waiting_permission'
  | 'error'
  | 'finished';

export type EditMode = 'diff' | 'whole' | 'architect' | string;
export type RoutingMode = 'auto' | 'manual' | string;
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

export interface Workspace {
  id: string;
  name: string;
  root_path: string;
}

/**
 * Common fields on every Part per SPEC §4.5: stable `id` within the
 * message, the `type` discriminator, and optional metadata. The
 * harness build omitted `id` and used wrong shapes for thinking /
 * tool_result; the v0.9 cut aligns to the spec.
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
  /** Spec uses `thinking`; we tolerate `text` for backward compat with
   *  the harness fixture build. New code should write `thinking`. */
  thinking?: string;
  text?: string;
  signature?: string;
}

export interface PartRedactedThinking extends PartBase {
  type: 'redacted_thinking';
  data: string;
  signature?: string;
}

export interface PartImage extends PartBase {
  type: 'image';
  source: ImageSource;
}

export interface ImageSource {
  kind: 'base64' | 'url' | 'file_id';
  media_type?: string;
  data?: string;
  url?: string;
  file_id?: string;
}

export interface PartToolCall extends PartBase {
  type: 'tool_call';
  /** Spec uses `call_id`; we accept legacy `id` for the harness path. */
  call_id?: string;
  tool_name: string;
  input?: Record<string, unknown>;
  server_id?: string;
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
  cached?: boolean;
  duration_ms?: number;
}

export interface FileDiff extends PartBase {
  type: 'file_diff';
  path: string;
  before?: string | null;
  after?: string | null;
  language?: string | null;
  applied?: boolean;
  /**
   * NOT in SPEC §4.5 — a convenience field some backends ship for
   * pre-rendered unified-diff display. When absent, the DiffPane
   * synthesizes one from `before` + `after`.
   */
  unified_diff?: string;
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

export interface PartRoutingDecision extends PartBase {
  type: 'routing_decision';
  selected_agent: string;
  rationale?: string;
  confidence?: number;
  heuristic: boolean;
}

export type Part =
  | PartText
  | PartThinking
  | PartRedactedThinking
  | PartImage
  | PartToolCall
  | PartToolResult
  | FileDiff
  | PartError
  | PartCompaction
  | PartRoutingDecision;

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

export interface ErrorInfo {
  error: string;
  message: string;
  recoverable?: boolean;
  details?: Record<string, unknown>;
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
}

/**
 * Capabilities envelope per `contract/SPEC.md` §3.3.
 *
 * The flat-field shape we shipped in the harness build was wrong against
 * a real `clio-agent-gact` server — the spec mandates a nested object with
 * a `backend` identity, a `capabilities` map, `transports`, `auth`,
 * and an `extensions` array. Capability gating in the UI reads through
 * `caps.capabilities.<flag>`, not `caps.<flag>` directly.
 */
export interface Capabilities {
  contract_version: string;
  backend: BackendIdentity;
  capabilities: CapabilityFlags;
  transports: Transports;
  auth: AuthSchemes;
  extensions: ExtensionDescriptor[];
}

export interface BackendIdentity {
  name: string;
  version: string;
  vendor: string;
  homepage?: string;
}

/**
 * Boolean feature flags per SPEC §3.3. Extra flags emitted by future
 * backends are allowed via the index signature; the typed names match
 * exactly what the spec enumerates today.
 */
export interface CapabilityFlags {
  workspaces?: boolean;
  sessions?: boolean;
  subagents?: boolean;
  mcp?: boolean;
  lsp?: boolean;
  files?: boolean;
  diffs?: boolean;
  permissions?: boolean;
  providers?: boolean;
  commands?: boolean;
  voice?: boolean;
  scheduled_sessions?: boolean;
  hooks?: boolean;
  session_tasks?: boolean;
  metrics?: boolean;
  session_branching?: boolean;
  session_sharing?: boolean;
  session_export?: boolean;
  /**
   * Forward-compat: an explicit session-summary action (a user-facing
   * TLDR/abstract-with-instructions, distinct from `compact` which mutates
   * the context window). clio-agent does NOT implement this yet — there is no
   * `POST /v1/sessions/{id}/summarize` route and it never emits
   * `session.summarized` (proven against source; tracked as iowarp/clio-agent
   * issue). The desktop's summarize palette actions are gated on this flag so
   * they stay hidden until a backend advertises the capability.
   */
  session_summary?: boolean;
  cost_tracking?: boolean;
  thinking_blocks?: boolean;
  edit_modes?: boolean;
  plan_mode?: boolean;
  search_messages?: boolean;
  agent_write?: boolean;
  skills_extraction?: boolean;
  agent_routing?: boolean;
  memory?: boolean;
  structured_errors?: boolean;
  integration_health?: boolean;
  tool_telemetry?: boolean;
  [k: string]: boolean | undefined;
}

export interface Transports {
  events_sse?: boolean;
  events_websocket?: boolean;
}

export interface AuthSchemes {
  schemes: string[];
  current: string;
}

export interface ExtensionDescriptor {
  id: string;
  version?: string;
  docs?: string;
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

/* ---------- Discovery surface — agents, providers, mcp, etc. ---------- */

export interface AgentDef {
  id: string;
  source?: 'builtin' | 'user' | string;
  title: string;
  description?: string;
  tools?: string[];
  metadata?: Record<string, unknown>;
  tier?: number;
  specialization?: string;
  keywords?: string[];
}

export interface ProviderDef {
  id: string;
  name: string;
  auth_methods?: string[];
  is_authenticated?: boolean;
  default_model?: string;
  api_base?: string;
  env_keys?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface McpServerInfo {
  id: string;
  name: string;
  status: 'ready' | 'starting' | 'error' | 'disconnected' | string;
  transport: string;
  tools_count: number;
  tools: string[];
  error?: string;
}

export interface HealthIntegration {
  name: string;
  status: 'ready' | 'degraded' | 'unavailable' | 'skipped' | string;
  detail?: string;
}

export interface HealthSnapshot {
  healthy: boolean;
  uptime_s: number;
  overall_status?: string;
  integrations?: HealthIntegration[];
}

export interface MemoryStats {
  cache: {
    hits: number;
    misses: number;
    hit_rate: number;
    capacity: number;
  };
  session?: unknown;
  global?: {
    conversations_total: number;
    invocations_total: number;
  };
  metadata?: Record<string, unknown>;
}

export interface MetricsSnapshot {
  uptime_s: number;
  sessions?: {
    total: number;
    active: number;
    by_status?: Record<string, number>;
  };
  messages?: {
    total: number;
    by_role?: Record<string, number>;
  };
  tokens?: {
    input_total: number;
    output_total: number;
    cache_read_total?: number;
    cache_write_total?: number;
  };
  cost?: {
    total_usd: number;
    by_provider?: Record<string, number>;
  };
  latencies?: Record<string, unknown>;
}

export interface SlashCommandDef {
  id: string;
  title: string;
  description?: string;
  source?: 'builtin' | 'user' | string;
  args_schema?: unknown;
}

/**
 * Prompt registry entry per clio-agent develop's `/v1/prompts` route
 * (PRs #376/#377 — prompt + expert pack runtimes). Each prompt may
 * carry multiple named profiles; the `default_profile` is what the
 * agent renders unless overridden.
 */
export interface PromptDef {
  id: string;
  title?: string;
  description?: string;
  default_profile?: string;
  /** Profile name → opaque definition. Shape varies by profile type. */
  profiles?: Record<string, unknown>;
  scope?: 'builtin' | 'user' | 'workspace' | string;
  source_path?: string;
  enabled?: boolean;
  validation_errors?: string[];
  metadata?: Record<string, unknown>;
}

export interface PromptSource {
  scope: string;
  root: string;
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
 * Per-session task entry per clio-agent develop /v1/sessions/{sid}/tasks
 * — lightweight TODO list the agent or user can populate during a turn.
 */
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

export interface SessionTask {
  id: string;
  session_id: string;
  title: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | string;
  created_at: string;
  updated_at: string;
  metadata?: Record<string, unknown>;
}

export interface LmConfigSnapshot {
  configured: boolean;
  provider: string;
  api_base: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  thinking_budget?: number;
  presets?: Array<{
    id: string;
    label: string;
    provider: string;
    api_base?: string;
    suggested_model?: string;
    requires_api_key?: boolean;
    description?: string;
  }>;
}
