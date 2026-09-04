import type { Provenance } from './domain.js';

export interface ProviderState {
  provider_id: string;
  models: Array<{ id: string; display_name: string }>;
  provenance: Provenance;
}

export interface ProviderDefinition {
  id: string;
  name: string;
  auth_methods: string[];
  is_authenticated: boolean;
  default_model?: string;
  api_base?: string;
  description?: string;
  metadata: Record<string, unknown>;
}

export interface ProviderModel {
  id: string;
  name?: string;
  label?: string;
  description?: string;
  context_window?: number;
  output_limit?: number;
  context_source?: string;
}

export interface ProviderModelCatalog {
  provider_id: string;
  models: ProviderModel[];
  source?: string;
  default_model?: string;
  generated_at?: string;
  error?: string;
}

export interface ProviderModelRefreshResult {
  provider: string;
  discovered: ProviderModel[];
  source: string;
  default_model: string;
  default_model_reason?: string;
  generated_at: string;
  added: string[];
  removed: string[];
  unchanged: string[];
  failed_reason?: string;
  rejected: Array<{ id?: string; reason?: string; [key: string]: string | undefined }>;
}

export interface ProviderHandshake {
  models: ProviderModel[];
  source: string;
  error?: string;
  connectivity: 'ok' | 'unreachable' | 'timeout' | 'skipped';
  auth: 'ok' | 'missing' | 'rejected' | 'not_required' | 'deferred';
  latency_ms?: number;
  generated_at: string;
}

export interface LanguageModelPreset {
  id: string;
  provider_id?: string;
  label: string;
  provider: string;
  litellm_prefix?: string;
  api_base?: string;
  suggested_model?: string;
  requires_api_key: boolean;
  auth_method?: string;
  is_authenticated: boolean;
  description?: string;
  status?: string;
  status_message?: string;
  supports_live_catalog: boolean;
  supports_vision: boolean;
  configuration_fields?: Array<{
    id: string;
    label: string;
    description?: string;
    placeholder?: string;
    required: boolean;
  }>;
  supports_runtime_sizing?: boolean;
  managed_service_id?: string;
}

export interface LanguageModelConfiguration {
  configured: boolean;
  provider_id?: string;
  provider: string;
  api_base: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  thinking_level?: string;
  thinking_effective?: string;
  state?: string;
  status_message?: string;
  error?: string;
  provider_options?: Record<string, string>;
  presets: LanguageModelPreset[];
}
