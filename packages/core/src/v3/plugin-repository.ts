import { z } from 'zod';
import {
  agentEntrySchema,
  agentResolutionSchema,
  marketplaceSummarySchema,
  pluginCatalogSchema,
  pluginCheckReportSchema,
  pluginMarketplaceSchema,
  removalPreviewSchema,
  sessionAgentSchema,
  type AgentDelta,
  type AgentEntry,
  type AgentResolution,
  type MarketplaceSummary,
  type PluginCatalog,
  type PluginCheckReport,
  type PluginMarketplace,
  type RemovalPreview,
  type PluginChangeApply,
  type SessionAgent,
} from './plugin-domain.js';
import { pluginReviewSchema, type PluginReview } from './plugin-review-schemas.js';
import { SessionObservabilityRepository } from './session-observability-repository.js';

const PLUGIN_REVIEW_PATH = /^\/v1\/plugins\/[^/?#]+\/review$/u;

/** Plugins, marketplaces, agents, user agents and the session's pinned agent. */
export class PluginRepository extends SessionObservabilityRepository {
  /** Installed plugins and packs, plus plugins whose update waits for the trust step. */
  public plugins(signal?: AbortSignal): Promise<PluginCatalog> {
    return this.transport.request({
      method: 'GET',
      path: '/v1/plugins',
      decode: (value) => pluginCatalogSchema.parse(value),
      signal,
    });
  }

  /**
   * What a person reviews before trusting a plugin, read from its files
   * without running them. `reviewUrl` is the `review_url` a flow's trust
   * permission names (`/v1/plugins/{name}/review`); any other address is
   * refused rather than fetched.
   */
  public pluginReview(reviewUrl: string, signal?: AbortSignal): Promise<PluginReview> {
    if (!PLUGIN_REVIEW_PATH.test(reviewUrl)) {
      return Promise.reject(new Error(`Not a plugin review address: ${reviewUrl}`));
    }
    return this.transport.request({
      method: 'GET',
      path: reviewUrl,
      decode: (value) => pluginReviewSchema.parse(value),
      signal,
    });
  }

  public async pluginMarketplaces(signal?: AbortSignal): Promise<PluginMarketplace[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/plugins/marketplaces',
      decode: (value) =>
        z.object({ marketplaces: z.array(pluginMarketplaceSchema).default([]) }).parse(value),
      signal,
    });
    return result.marketplaces;
  }

  /** Install a marketplace from a git URL or folder. Untrusted sources wait for {@link trustPluginMarketplace}. */
  public installPluginMarketplace(
    input: { source: string; ref?: string; commit?: string; name?: string },
    signal?: AbortSignal,
  ): Promise<MarketplaceSummary> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/plugins/marketplaces',
      body: {
        source: input.source,
        ...(input.ref ? { ref: input.ref } : {}),
        ...(input.commit ? { commit: input.commit } : {}),
        ...(input.name ? { name: input.name } : {}),
      },
      decode: (value) => marketplaceSummarySchema.parse(value),
      signal,
    });
  }

  /** The explicit trust step for a marketplace's current executable parts. */
  public trustPluginMarketplace(name: string, signal?: AbortSignal): Promise<MarketplaceSummary> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/plugins/marketplaces/${encodeURIComponent(name)}/trust`,
      decode: (value) => marketplaceSummarySchema.parse(value),
      signal,
    });
  }

  public updatePluginMarketplace(name: string, signal?: AbortSignal): Promise<MarketplaceSummary> {
    return this.transport.request({
      method: 'POST',
      path: `/v1/plugins/marketplaces/${encodeURIComponent(name)}/update`,
      decode: (value) => marketplaceSummarySchema.parse(value),
      signal,
    });
  }

  public async uninstallPluginMarketplace(name: string, signal?: AbortSignal): Promise<void> {
    await this.transport.request({
      method: 'DELETE',
      path: `/v1/plugins/marketplaces/${encodeURIComponent(name)}`,
      decode: (value) => z.object({ uninstalled: z.string() }).parse(value),
      signal,
    });
  }

  /** Run the install resolver over an installed marketplace without changing anything. */
  public checkPlugins(
    input: { installed: string } | { path: string },
    signal?: AbortSignal,
  ): Promise<PluginCheckReport> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/plugins/check',
      body: input,
      decode: (value) => pluginCheckReportSchema.parse(value),
      signal,
    });
  }

  /** Installed agents and the user's saved agents. */
  public async agents(signal?: AbortSignal): Promise<AgentEntry[]> {
    const result = await this.transport.request({
      method: 'GET',
      path: '/v1/agents',
      decode: (value) => z.object({ agents: z.array(agentEntrySchema).default([]) }).parse(value),
      signal,
    });
    return result.agents;
  }

  /** Preview an agent with a delta: provenance, removals and the composed prompt. Pins nothing. */
  public resolveAgent(
    ref: string,
    delta: AgentDelta = { add: [], remove: [] },
    signal?: AbortSignal,
  ): Promise<AgentResolution> {
    const query = new URLSearchParams({ ref });
    for (const id of delta.add) query.append('add', id);
    for (const id of delta.remove) query.append('remove', id);
    return this.transport.request({
      method: 'GET',
      path: `/v1/agents/resolve?${query}`,
      decode: (value) => agentResolutionSchema.parse(value),
      signal,
    });
  }

  /** Which plugins leave with `plugin`: its dependents through hard requirements. */
  public previewPluginRemoval(
    input: { ref: string; plugin: string; delta: AgentDelta },
    signal?: AbortSignal,
  ): Promise<RemovalPreview> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/agents/preview-removal',
      body: input,
      decode: (value) => removalPreviewSchema.parse(value),
      signal,
    });
  }

  /** Save a composition as a user agent: its parent plus a delta (`user/<id>`). */
  public saveUserAgent(
    input: {
      id: string;
      extends: string;
      add: string[];
      remove: string[];
      name?: string;
      description?: string;
    },
    signal?: AbortSignal,
  ): Promise<AgentEntry> {
    return this.transport.request({
      method: 'POST',
      path: '/v1/agents/user',
      body: input,
      decode: (value) => agentEntrySchema.parse(value),
      signal,
    });
  }

  public async deleteUserAgent(id: string, signal?: AbortSignal): Promise<void> {
    await this.transport.request({
      method: 'DELETE',
      path: `/v1/agents/user/${encodeURIComponent(id)}`,
      decode: (value) => z.object({ deleted: z.string() }).parse(value),
      signal,
    });
  }

  /** The session's pinned resolution and its live delta. */
  public sessionAgent(sessionId: string, signal?: AbortSignal): Promise<SessionAgent> {
    return this.transport.request({
      method: 'GET',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/agent`,
      decode: (value) => sessionAgentSchema.parse(value),
      signal,
    });
  }

  /**
   * Change the session's agent or its delta and pin the new resolution. The
   * delta replaces the session's whole delta; it is not merged. `apply` says
   * how the change reaches the model; the service defaults to `now`.
   */
  public updateSessionAgent(
    sessionId: string,
    input: { ref?: string; delta?: AgentDelta; apply?: PluginChangeApply },
    signal?: AbortSignal,
  ): Promise<SessionAgent> {
    return this.transport.request({
      method: 'PATCH',
      path: `/v1/sessions/${encodeURIComponent(sessionId)}/agent`,
      body: {
        ...(input.ref ? { ref: input.ref } : {}),
        ...(input.delta ? { add: input.delta.add, remove: input.delta.remove } : {}),
        ...(input.apply ? { apply: input.apply } : {}),
      },
      decode: (value) => sessionAgentSchema.parse(value),
      signal,
    });
  }
}
