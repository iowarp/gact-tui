import type { RegistryModel } from '@clio/core/v3';
import { modelCapabilityTagsFromOption } from './model-capability-tags';

/** Registry and serving-model rows use the same evidence-based capability chips. */
export function registryModelTags(
  model: Pick<RegistryModel, 'repository' | 'capability_tags' | 'model_facts'> & {
    context_window?: number | null;
  },
) {
  return modelCapabilityTagsFromOption({
    providerId: 'huggingface',
    // i18n-ignore: product name
    providerName: 'Hugging Face',
    id: model.repository,
    label: model.repository,
    available: false,
    capabilityTags: model.capability_tags,
    modelFacts: model.model_facts,
    contextWindow: model.context_window || undefined,
    contextBasis: 'native',
  });
}
