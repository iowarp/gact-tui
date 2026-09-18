import type {
  LanguageModelConfiguration,
  ProviderDefinition,
  ProviderHandshake,
  ProviderModelCatalog,
  ProviderModelRefreshResult,
} from './domain.js';
import { z } from 'zod';
import {
  providerHandshakeSchema,
  providerListSchema,
  providerModelCatalogSchema,
  providerModelRefreshResponseSchema,
} from './repository-decoders.js';
import { languageModelConfigurationSchema } from './schemas.js';
import { ContextRepository } from './context-repository.js';

/**
 * Whole-request budget for `GET /v1/providers/lm/wait`. The server blocks
 * server-side for up to its own `timeout` query parameter (capped at 600s);
 * the request-level budget must outlive that or a transport that enforces
 * its own timeout (the desktop Tauri bridge's default is 30s) cuts the
 * connection out from under a still-configuring provider.
 */
const LM_WAIT_SERVER_TIMEOUT_S = 600;
const LM_WAIT_REQUEST_TIMEOUT_MS = 610_000;

/** Provider discovery, model catalog, handshake, and active-model configuration. */
export class ProviderRepository extends ContextRepository {
  public async providers(signal?: AbortSignal): Promise<ProviderDefinition[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/providers',
      decode: (value) => providerListSchema.parse(value),
      signal,
    });
    return result.providers as ProviderDefinition[];
  }

  public languageModelConfiguration(signal?: AbortSignal): Promise<LanguageModelConfiguration> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/providers/lm',
      decode: (value) => languageModelConfigurationSchema.parse(value),
      signal,
    });
  }

  public async providerModels(
    providerId: string,
    signal?: AbortSignal,
  ): Promise<ProviderModelCatalog> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/providers/${encodeURIComponent(providerId)}/models`,
      decode: (value) => providerModelCatalogSchema.parse(value),
      signal,
    });
    return { ...result, provider_id: providerId } as ProviderModelCatalog;
  }

  public async refreshProviderModels(
    providerIds?: readonly string[],
    signal?: AbortSignal,
  ): Promise<ProviderModelRefreshResult[]> {
    const result = await this.transport.request({
      method: 'POST',
      path: '/v1/providers/models/refresh',
      body: providerIds?.length ? { providers: providerIds } : {},
      decode: (value) => providerModelRefreshResponseSchema.parse(value),
      signal,
    });
    return result.results as ProviderModelRefreshResult[];
  }

  public providerHandshake(
    providerId: string,
    options: { apiBase?: string; refresh?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<ProviderHandshake> {
    const query = new URLSearchParams();
    if (options.apiBase) query.set('api_base', options.apiBase);
    if (options.refresh) query.set('refresh', 'true');
    return this.transport.request({
      method: 'GET',
      path: `/v1/providers/${encodeURIComponent(providerId)}/handshake${query.size ? `?${query.toString()}` : ''}`,
      decode: (value) => providerHandshakeSchema.parse(value),
      signal,
    });
  }

  public authenticateProvider(
    providerId: string,
    options: { force?: boolean } = {},
    signal?: AbortSignal,
  ): Promise<{ provider_id: string; is_authenticated: boolean; instructions: string }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/auth`,
      body: { force: options.force ?? false },
      decode: (value) =>
        z
          .object({
            provider_id: z.string(),
            is_authenticated: z.boolean(),
            instructions: z.string(),
          })
          .parse(value),
      signal,
    });
  }

  public updateLanguageModelConfiguration(
    input: {
      provider_id: string;
      provider: string;
      api_base: string;
      model: string;
      api_key?: string;
      provider_options: Record<string, string>;
      thinking_level?: 'off' | 'low' | 'medium' | 'high';
      parallel?: number;
      context_length?: number;
      max_tokens?: number;
      temperature?: number;
    },
    signal?: AbortSignal,
  ): Promise<LanguageModelConfiguration> {
    return this.transport.request({
      method: 'PUT',
      path: '/v1/providers/lm',
      body: input,
      decode: (value) => languageModelConfigurationSchema.parse(value),
      signal,
    });
  }

  public waitLanguageModelConfiguration(signal?: AbortSignal): Promise<LanguageModelConfiguration> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/providers/lm/wait?timeout=${LM_WAIT_SERVER_TIMEOUT_S}`,
      decode: (value) => languageModelConfigurationSchema.parse(value),
      // Only a transport that enforces its own timeout (the desktop bridge)
      // honours this; the browser transport leaves the wait to the abort
      // signal. Either way it must exceed the server's own wait budget above.
      timeoutMs: LM_WAIT_REQUEST_TIMEOUT_MS,
      signal,
    });
  }
}
