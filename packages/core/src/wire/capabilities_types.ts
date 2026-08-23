/**
 * Capabilities envelope per `contract/SPEC.md` section 3.3.
 *
 * The flat-field shape we shipped in the harness build was wrong against
 * a real `clio-agent-gact` server - the spec mandates a nested object with
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
 * Boolean feature flags per SPEC section 3.3. Extra flags emitted by future
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
   * the context window). clio-agent does NOT implement this yet - there is no
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
  /** Upload file bytes as session attachments (clio PR #527). */
  attachments_upload?: boolean;
  /**
   * POST /messages accepts and preserves image parts; the backend can
   * route them to a vision-capable model (clio develop >= 2026-06). Gates
   * the desktop's image-attachment send + inline image rendering.
   *
   * NOTE: this replaces the removed `x_clio_files_content` flag. Context-
   * file *content* is no longer a session-scoped base64 endpoint; bytes
   * now come from the workspace-scoped `GET /v1/workspaces/{wid}/files/read`
   * (see Client.readWorkspaceFile). Previews gate on `files`/this flag.
   */
  multimodal_image_parts?: boolean;
  /**
   * The backend publishes per-session `semantic.event` SSE frames (a
   * read-only execution trace). Gates the Inspector timeline's semantic
   * rows (verified true on live :17803).
   */
  x_clio_semantic_events?: boolean;
  /** Format-aware immutable document review and editor integration surface. */
  x_clio_document_artifacts?: {
    protocol_version?: string;
    profiles?: string[];
    anchors?: string[];
    review_parts?: boolean;
    floating_comments?: boolean;
    immutable_revisions?: boolean;
    native_working_copies?: boolean;
    native_comment_trigger?: string;
    embedded_editors?: string[];
    static_html_scripts?: string;
    executable_html_transition?: string;
    [key: string]: unknown;
  };
  /**
   * Identifier for the hook execution backend, e.g. `"local_python"`.
   * Surfaced verbatim; not gated on.
   */
  x_clio_hook_backend?: string;
  /**
   * Count of registered hooks by event name, e.g.
   * `{pre_message: 1, post_tool: 0, ...}`. A non-zero `pre_message` means a
   * turn can be blocked (see GAP 1 - blocked `message.completed`).
   */
  x_clio_hook_events?: Record<string, number>;
  /**
   * Loosened to admit clio's real capabilities map, which mixes booleans
   * with string flags (e.g. `x_clio_hook_backend`, `x_clio_text_streaming`)
   * and nested object flags (e.g. `x_clio_hook_events`,
   * `x_clio_stream_fallback_reasons`, `x_clio_capability_gaps`). Verified
   * against GET /v1/capabilities on live :17803.
   */
  [k: string]: boolean | string | number | Record<string, unknown> | undefined;
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
