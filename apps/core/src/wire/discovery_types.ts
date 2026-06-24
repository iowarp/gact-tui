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
  /** The provider/model can accept image parts in a turn (clio LM preset
   * `supports_vision`, develop >= 2026-06). Pairs with the
   * `multimodal_image_parts` capability to gate image-attachment send. */
  supports_vision?: boolean;
  metadata?: Record<string, unknown>;
}

/** A registered Agent Blueprint *source* (git/local registry clio scans for
 * installable blueprints). `GET/POST/DELETE /v1/agent-blueprints/sources`
 * + `/refresh` (clio develop >= 2026-06). */
export interface BlueprintSource {
  id: string;
  name: string;
  source: string;
  ref?: string;
  pinned_commit?: string;
  status: 'ok' | 'error' | 'unknown' | string;
  status_message?: string;
  added_at?: string;
  updated_at?: string;
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

export interface SlashCommandDef {
  id: string;
  title: string;
  description?: string;
  source?: 'builtin' | 'user' | string;
  args_schema?: unknown;
}

/**
 * Prompt registry entry per clio-agent develop's `/v1/prompts` route
 * (PRs #376/#377 - prompt + expert pack runtimes). Each prompt may
 * carry multiple named profiles; the `default_profile` is what the
 * agent renders unless overridden.
 */
export interface PromptDef {
  id: string;
  title?: string;
  description?: string;
  default_profile?: string;
  /** Profile name to opaque definition. Shape varies by profile type. */
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
