import type { LmConfigSnapshot, ProviderDef } from '../wire/types.js';
import type { HttpTransport } from './transport.js';

type ProviderTransport = Pick<HttpTransport, 'get' | 'post' | 'request'>;

export interface ProvidersResult {
  providers: ProviderDef[];
}

export interface ProviderDetail {
  id: string;
  name?: string;
  vendor?: string;
  status?: string;
  auth?: {
    kind?: string;
    required?: boolean;
    supports?: string[];
  };
  default_model?: string;
  metadata?: Record<string, unknown>;
  [k: string]: unknown;
}

export interface ProviderModel {
  id: string;
  name?: string;
  label?: string;
  description?: string;
  source?: 'builtin' | 'discovered' | string;
  error?: string;
  context_length?: number;
  cost_usd_per_M_tokens?: number;
}

export interface ProviderModelsResult {
  models: ProviderModel[];
  source?: string;
  error?: string;
}

export interface SetLmInput {
  provider: string;
  api_base: string;
  model: string;
  temperature?: number;
  max_tokens?: number;
  /**
   * Provider-generic extended-reasoning level (#895): one of
   * off | low | medium | high. Omit to leave the provider default (the server
   * validates the vocabulary — an out-of-range value is a 422).
   */
  thinking_level?: 'off' | 'low' | 'medium' | 'high';
}

export interface AuthProviderResult {
  is_authenticated: boolean;
  provider_id: string;
  instructions?: string;
}

export function fetchProviders(client: ProviderTransport): Promise<ProvidersResult> {
  return client.get<ProvidersResult>('/v1/providers');
}

export function fetchProvider(
  client: ProviderTransport,
  providerId: string,
): Promise<ProviderDetail> {
  return client.get(`/v1/providers/${encodeURIComponent(providerId)}`);
}

export function fetchProviderModels(
  client: ProviderTransport,
  providerId: string,
  apiBase?: string,
): Promise<ProviderModelsResult> {
  const qs = new URLSearchParams();
  if (apiBase) qs.set('api_base', apiBase);
  const suffix = qs.toString() ? `?${qs}` : '';
  return client.get(`/v1/providers/${encodeURIComponent(providerId)}/models${suffix}`);
}

export function fetchLmConfig(client: ProviderTransport): Promise<LmConfigSnapshot> {
  return client.get<LmConfigSnapshot>('/v1/providers/lm');
}

export function updateLmConfig(
  client: ProviderTransport,
  body: SetLmInput,
): Promise<LmConfigSnapshot> {
  return client.request<LmConfigSnapshot>('/v1/providers/lm', 'PUT', body);
}

export function authenticateProvider(
  client: ProviderTransport,
  providerId: string,
): Promise<AuthProviderResult> {
  return client.post<AuthProviderResult>(
    `/v1/providers/${encodeURIComponent(providerId)}/auth`,
    {},
  );
}
