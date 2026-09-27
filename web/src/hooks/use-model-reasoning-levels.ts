import { modelReasoningLevels, type ModelReasoningLevels } from '@/lib/reasoning-levels';
import { useCatalogModel } from './use-catalog-model';

/** The thinking levels one catalog model reports (undefined while unknown). */
export function useModelReasoningLevels(
  providerId: string | undefined,
  modelId: string | undefined,
  resolvedModelId?: string,
): ModelReasoningLevels | undefined {
  const model = useCatalogModel(providerId, modelId, resolvedModelId);
  if (!providerId || !modelId) return undefined;
  return modelReasoningLevels(model?.reasoning);
}
