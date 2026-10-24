import type { Provenance } from './domain.js';

/** One section of the prompt the model receives, sized for the context breakdown. */
export interface ContextPromptSection {
  id: string;
  label: string;
  tokens_estimated: number;
  count: number;
  items: Array<{ label: string; tokens_estimated: number }>;
}

export interface ContextSnapshot {
  session_id: string;
  scope?: string;
  used_tokens?: number;
  used_tokens_source?: 'provider' | 'estimated';
  usage_model?: string;
  cache_read_tokens?: number;
  cache_write_tokens?: number;
  cache_tokens_measured?: boolean;
  limit_tokens?: number;
  live_tokens?: number;
  live_block_count?: number;
  tokens_by_kind?: Record<string, number>;
  categories?: Record<string, number>;
  prompt_breakdown?: {
    method: 'characters_div_4';
    tokens_estimated: number;
    media_items: number;
    sections: ContextPromptSection[];
  };
  usage_recorded_at?: string;
  autocompact_enabled?: boolean;
  autocompact_pct?: number;
  segments?: Array<Record<string, unknown>>;
  render_text?: string;
  /** The agent's context as the model receives it (role + typed parts). */
  messages?: Array<{ role: string; parts: Array<Record<string, unknown>> }>;
  provenance: Provenance;
}
