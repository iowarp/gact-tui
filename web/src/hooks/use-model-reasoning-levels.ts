import { matchesConfiguredModel } from '@/lib/model-options';
import { modelReasoningLevels, type ModelReasoningLevels } from '@/lib/reasoning-levels';
import { useProviderCatalog } from './use-provider-catalog';

/**
 * The thinking levels one catalog model reports (undefined while unknown).
 *
 * `modelId` may be the provider's own alias for a model (e.g. claude_code's
 * "sonnet") rather than its catalog id ("claude-sonnet-5"); matching by id
 * alone silently hides the selector for every alias-configured model (#1436).
 * `resolvedModelId`, when the caller has it (GET /v1/providers/lm), is an
 * extra match key for the currently configured model.
 */
export function useModelReasoningLevels(
  providerId: string | undefined,
  modelId: string | undefined,
  resolvedModelId?: string,
): ModelReasoningLevels | undefined {
  const catalog = useProviderCatalog();
  if (!providerId || !modelId) return undefined;
  const model = catalog.data?.providers
    .find((provider) => provider.id === providerId)
    ?.models.find((row) =>
      matchesConfiguredModel({ id: row.model_id, aliases: row.aliases }, modelId, resolvedModelId),
    );
  return modelReasoningLevels(model?.reasoning);
}
