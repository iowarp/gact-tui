import type { LanguageModelPreset, ProviderModel } from '@clio/core/v3';

export interface ClioModelOption {
  providerId: string;
  providerName: string;
  id: string;
  label: string;
  description?: string;
}

/** Build the composer catalog without losing an authoritative active model. */
export function buildModelOptions({
  activeCatalogProvider,
  activeModel,
  activeProvider,
  catalogModels,
  presets,
}: {
  activeCatalogProvider: string;
  activeModel?: string;
  activeProvider?: string;
  catalogModels?: readonly ProviderModel[];
  presets: readonly LanguageModelPreset[];
}): ClioModelOption[] {
  const options = presets.flatMap((preset) => {
    const models =
      preset.id === activeCatalogProvider && catalogModels?.length
        ? catalogModels
        : preset.suggested_model
          ? [{ id: preset.suggested_model, name: preset.suggested_model }]
          : [];
    return models.map((item) => ({
      providerId: preset.id,
      providerName: preset.label,
      id: item.id,
      label: item.name ?? item.label ?? item.id,
      description: item.description,
    }));
  });
  if (
    activeProvider &&
    activeModel &&
    !options.some((option) => option.providerId === activeProvider && option.id === activeModel)
  ) {
    const activePreset = presets.find(
      (preset) => preset.id === activeProvider || preset.provider === activeProvider,
    );
    options.unshift({
      providerId: activeProvider,
      providerName: activePreset?.label ?? activeProvider,
      id: activeModel,
      label: activeModel,
      description: undefined,
    });
  }
  return options;
}
