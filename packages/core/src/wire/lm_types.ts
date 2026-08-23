export interface LmConfigSnapshot {
  configured: boolean;
  provider: string;
  api_base: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  thinking_budget?: number;
  /**
   * Provider-generic extended-reasoning level in effect: off | low | medium |
   * high, or absent/empty = provider default (#895). Echoed by GET /v1/providers/lm.
   */
  thinking_level?: string;
  /**
   * Human-readable resolved per-provider effect of the thinking level — e.g.
   * "medium (budget 8192)", "off", "default (provider default)", or
   * "unsupported (<reason>)". Display-only; the server never leaves it invisible.
   */
  thinking_effective?: string;
  presets?: LmPreset[];
}

/**
 * A configurable LM preset surfaced by GET /v1/providers/lm. These are the
 * validated choices the desktop turns into provider/model dropdowns - a
 * novice picks one of these rather than typing a backend URL. Shape verified
 * against the live clio build on :17807 (`presets[]`).
 */
export interface LmPreset {
  id: string;
  label: string;
  provider: string;
  api_base?: string;
  suggested_model?: string;
  requires_api_key?: boolean;
  /** Env var clio reads the key from (e.g. CLIO_LM_API_KEY) when required. */
  api_key_env?: string;
  /** none | api_key | oauth - drives the "needs key / needs login" hint. */
  auth_method?: string;
  /** Whether clio already has working credentials for this preset. */
  is_authenticated?: boolean;
  description?: string;
  /** ready | needs_auth | error | ... - the human-facing readiness state. */
  status?: string;
  status_message?: string;
  /** True if GET /v1/providers/{id}/models returns a live model catalog. */
  supports_live_catalog?: boolean;
  supports_vision?: boolean;
}
