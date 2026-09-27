import type { ProviderCatalogModel } from '@clio/core/v3';
import { matchesConfiguredModel } from '@/lib/model-options';
import { useProviderCatalog } from './use-provider-catalog';

/**
 * The provider-catalog row for one model (undefined while unknown).
 *
 * `modelId` may be the provider's own alias for a model (e.g. claude_code's
 * "sonnet") rather than its catalog id ("claude-sonnet-5"); matching by id
 * alone silently misses every alias-configured model (#1436).
 * `resolvedModelId`, when the caller has it (GET /v1/providers/lm), is an
 * extra match key for the currently configured model. A multi-transport
 * provider (Codex) lists a model once per transport; `transport` picks the
 * row the model was bound through, when given.
 */
export function useCatalogModel(
  providerId: string | undefined,
  modelId: string | undefined,
  resolvedModelId?: string,
  transport?: string,
): ProviderCatalogModel | undefined {
  const catalog = useProviderCatalog();
  if (!providerId || !modelId) return undefined;
  const rows = (
    catalog.data?.providers.find((provider) => provider.id === providerId)?.models ?? []
  ).filter((row) =>
    matchesConfiguredModel({ id: row.model_id, aliases: row.aliases }, modelId, resolvedModelId),
  );
  return (transport ? rows.find((row) => row.transport === transport) : undefined) ?? rows[0];
}
