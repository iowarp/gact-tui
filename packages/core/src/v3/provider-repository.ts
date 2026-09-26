import type { ReasoningEffort } from './composer-domain.js';
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
import {
  savedServerListSchema,
  savedServerSchema,
  type SavedServer,
} from './saved-server-domain.js';

/**
 * Whole-request budget for `GET /v1/providers/lm/wait`. The server blocks
 * server-side for up to its own `timeout` query parameter (capped at 600s);
 * the request-level budget must outlive that or a transport that enforces
 * its own timeout (the desktop Tauri bridge's default is 30s) cuts the
 * connection out from under a still-configuring provider.
 */
const LM_WAIT_SERVER_TIMEOUT_S = 600;
const LM_WAIT_REQUEST_TIMEOUT_MS = 610_000;

/** The generic provider sign-in API's `start` response (SPEC §6.12). */
export interface ProviderAuthStart {
  provider_id: string;
  flow_id: string;
  browser?: { authorization_url: string; loopback: boolean; loopback_unavailable_reason?: string };
  device?: { user_code: string; verification_url: string; interval: number };
  instructions: string;
}

/** The generic provider sign-in API's `status` poll response. */
export interface ProviderAuthStatus {
  provider_id: string;
  state: 'pending' | 'complete' | 'failed';
  reason: string;
}

const providerAuthStartSchema = z.object({
  provider_id: z.string(),
  flow_id: z.string(),
  browser: z
    .object({
      authorization_url: z.string(),
      loopback: z.boolean(),
      loopback_unavailable_reason: z.string().optional(),
    })
    .optional(),
  device: z
    .object({
      user_code: z.string(),
      verification_url: z.string(),
      interval: z.number(),
    })
    .optional(),
  instructions: z.string(),
});

const providerAuthStatusSchema = z.object({
  provider_id: z.string(),
  state: z.enum(['pending', 'complete', 'failed']),
  reason: z.string(),
});

/** Shared shape for every generic-auth action that just reports the
 * resulting credential state (logout, complete, save/clear API key). */
const providerAuthResultSchema = z.object({
  provider_id: z.string(),
  is_authenticated: z.boolean(),
  instructions: z.string(),
});
type ProviderAuthResult = z.infer<typeof providerAuthResultSchema>;

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
    options: { force?: boolean; method?: 'browser' | 'device' } = {},
    signal?: AbortSignal,
  ): Promise<ProviderAuthStart> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/auth`,
      body: { action: 'start', force: options.force ?? false, method: options.method },
      decode: (value) => providerAuthStartSchema.parse(value),
      signal,
    });
  }

  /** Poll a started sign-in flow (SPEC generic auth API `status`). */
  public providerAuthStatus(
    providerId: string,
    flowId: string,
    signal?: AbortSignal,
  ): Promise<ProviderAuthStatus> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/auth`,
      body: { action: 'status', flow_id: flowId },
      decode: (value) => providerAuthStatusSchema.parse(value),
      signal,
    });
  }

  /** Delete the stored credential for a subscription/OAuth provider. */
  public logoutProvider(providerId: string, signal?: AbortSignal): Promise<ProviderAuthResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/auth`,
      body: { action: 'logout' },
      decode: (value) => providerAuthResultSchema.parse(value),
      signal,
    });
  }

  /**
   * Save an API key for a `requires_api_key` provider WITHOUT binding it as
   * the active default -- unlike `updateLanguageModelConfiguration`, this
   * never switches which provider the running agent uses. The model
   * picker's inline key field uses this so saving OpenRouter's key, say,
   * cannot silently rebind the agent onto OpenRouter.
   */
  public saveProviderApiKey(
    providerId: string,
    apiKey: string,
    signal?: AbortSignal,
  ): Promise<ProviderAuthResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/auth`,
      body: { action: 'save_api_key', api_key: apiKey },
      decode: (value) => providerAuthResultSchema.parse(value),
      signal,
    });
  }

  /** The ready-state counterpart to {@link saveProviderApiKey}. */
  public clearProviderApiKey(
    providerId: string,
    signal?: AbortSignal,
  ): Promise<ProviderAuthResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/auth`,
      body: { action: 'clear_api_key' },
      decode: (value) => providerAuthResultSchema.parse(value),
      signal,
    });
  }

  public installProviderSupport(
    providerId: string,
    signal?: AbortSignal,
  ): Promise<{ provider_id: string; installed: boolean; instructions: string }> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/install`,
      body: {},
      decode: (value) =>
        z
          .object({
            provider_id: z.string(),
            installed: z.boolean(),
            instructions: z.string(),
          })
          .parse(value),
      signal,
    });
  }

  public completeProviderAuthentication(
    providerId: string,
    input: { flowId: string; paste: string },
    signal?: AbortSignal,
  ): Promise<ProviderAuthResult> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/${encodeURIComponent(providerId)}/auth`,
      body: {
        action: 'complete',
        flow_id: input.flowId,
        paste: input.paste,
      },
      decode: (value) => providerAuthResultSchema.parse(value),
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
      thinking_level?: ReasoningEffort | null;
      parallel?: number;
      context_length?: number;
      max_tokens?: number;
      temperature?: number;
      /** Which of a multi-transport provider's transports to bind (Codex: "sdk" | "direct"). */
      variant?: string;
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

  /** Saved local/self-hosted servers; `check` probes every one of them now. */
  public async savedServers(check = false, signal?: AbortSignal): Promise<SavedServer[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: `/v1/providers/servers${check ? '?check=true' : ''}`,
      decode: (value) => savedServerListSchema.parse(value),
      signal,
    });
    return result.servers;
  }

  /** Save a server -- a catalog runtime's address (`preset_id`) or a custom one -- and check it. */
  public addSavedServer(
    input: { address: string; label?: string; preset_id?: string },
    signal?: AbortSignal,
  ): Promise<SavedServer> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/providers/servers',
      body: input,
      decode: (value) => savedServerSchema.parse(value),
      signal,
    });
  }

  /** Change a saved server's address or label, and check it. */
  public updateSavedServer(
    serverId: string,
    input: { address?: string; label?: string },
    signal?: AbortSignal,
  ): Promise<SavedServer> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/providers/servers/${encodeURIComponent(serverId)}`,
      body: input,
      decode: (value) => savedServerSchema.parse(value),
      signal,
    });
  }

  /** Forget a saved server (a catalog runtime goes back to its own address). */
  public async removeSavedServer(serverId: string, signal?: AbortSignal): Promise<void> {
    await this.transport.request({
      method: 'DELETE',
      path: `/v1/providers/servers/${encodeURIComponent(serverId)}`,
      decode: (value) => z.object({ removed: z.string() }).parse(value),
      signal,
    });
  }

  /** Check one saved server's reachability now. */
  public checkSavedServer(serverId: string, signal?: AbortSignal): Promise<SavedServer> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/providers/servers/${encodeURIComponent(serverId)}/check`,
      decode: (value) => savedServerSchema.parse(value),
      signal,
    });
  }
}
