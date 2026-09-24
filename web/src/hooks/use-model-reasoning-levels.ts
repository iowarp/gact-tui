import { modelReasoningLevels, type ModelReasoningLevels } from '@/lib/reasoning-levels';
import { useProviderCatalog } from './use-provider-catalog';

/** The thinking levels one catalog model reports (undefined while unknown). */
export function useModelReasoningLevels(
  providerId: string | undefined,
  modelId: string | undefined,
): ModelReasoningLevels | undefined {
  const catalog = useProviderCatalog();
  if (!providerId || !modelId) return undefined;
  const model = catalog.data?.providers
    .find((provider) => provider.id === providerId)
    ?.models.find((row) => row.model_id === modelId);
  return modelReasoningLevels(model?.reasoning);
}
