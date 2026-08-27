import type {
  LanguageModelConfiguration,
  ProviderDefinition,
  ProviderHandshake,
  ProviderModelCatalog,
  ProviderModelRefreshResult,
} from './domain.js';
import {
  providerHandshakeSchema,
  providerListSchema,
  providerModelCatalogSchema,
  providerModelRefreshResponseSchema,
} from './repository-decoders.js';
import { languageModelConfigurationSchema } from './schemas.js';
import { ContextRepository } from './context-repository.js';

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

  public updateLanguageModelConfiguration(
    input: {
      provider: string;
      api_base: string;
      model: string;
      thinking_level?: 'off' | 'low' | 'medium' | 'high';
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
}
