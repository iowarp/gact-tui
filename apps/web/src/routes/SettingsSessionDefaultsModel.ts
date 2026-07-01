/**
 * Pure helpers for the session-defaults settings: scopes the blueprint/expert
 * catalog query and shapes the API results into selectable catalog options.
 */
import type { AgentBlueprintsOptions, AgentBlueprintsResult, ExpertPacksResult } from '@clio/core';
import { presentBlueprintLabel } from '../brand-presentation.js';

export interface SessionDefaultsContext {
  sessionId?: string;
  workspaceId?: string;
}

export interface SessionDefaultCatalogOption {
  id: string;
  label: string;
  description?: string;
}

export interface SessionDefaultsCatalog {
  blueprints: SessionDefaultCatalogOption[];
  expertPacks: SessionDefaultCatalogOption[];
}

export function sessionDefaultsCatalogScope(
  context?: SessionDefaultsContext,
): AgentBlueprintsOptions {
  return {
    ...(context?.sessionId ? { session_id: context.sessionId } : {}),
    ...(context?.workspaceId ? { workspace_id: context.workspaceId } : {}),
  };
}

export function sessionDefaultOptions(
  items: Array<{ id: string; name?: string; description?: string }>,
): SessionDefaultCatalogOption[] {
  return items.map((item) => ({
    id: item.id,
    label: presentBlueprintLabel(item.name ?? item.id, item.id),
    ...(item.description ? { description: item.description } : {}),
  }));
}

export function sessionDefaultsCatalogFromSettled(
  blueprints: PromiseSettledResult<AgentBlueprintsResult>,
  expertPacks: PromiseSettledResult<ExpertPacksResult>,
): SessionDefaultsCatalog {
  return {
    blueprints:
      blueprints.status === 'fulfilled' ? sessionDefaultOptions(blueprints.value.blueprints) : [],
    expertPacks:
      expertPacks.status === 'fulfilled' ? sessionDefaultOptions(expertPacks.value.packs) : [],
  };
}
