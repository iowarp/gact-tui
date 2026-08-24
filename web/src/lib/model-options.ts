import type { LanguageModelPreset, ProviderModel } from '@clio/core/v3';
import { providerStatusDetail } from './provider-availability';
import { providerDisplayName } from './provider-presentation';

export interface ClioModelOption {
  providerId: string;
  providerName: string;
  id: string;
  label: string;
  description?: string;
  available: boolean;
  availabilityDetail?: string;
}

/** Build the composer catalog without losing an authoritative active model. */
export function buildModelOptions({
  activeCatalogProvider,
  activeModel,
  activeProvider,
  catalogModels,
  catalogModelsByProvider,
  presets,
}: {
  activeCatalogProvider: string;
  activeModel?: string;
  activeProvider?: string;
  catalogModels?: readonly ProviderModel[];
  catalogModelsByProvider?: Readonly<Record<string, readonly ProviderModel[] | undefined>>;
  presets: readonly LanguageModelPreset[];
}): ClioModelOption[] {
  const options = presets.flatMap((preset) => {
    const models =
      catalogModelsByProvider?.[preset.id]?.length
        ? catalogModelsByProvider[preset.id]
        : preset.id === activeCatalogProvider && catalogModels?.length
        ? catalogModels
        : preset.suggested_model
          ? [{ id: preset.suggested_model, name: preset.suggested_model }]
          : [];
    return (models ?? []).map((item) => ({
      providerId: preset.id,
      providerName: providerDisplayName(preset),
      id: item.id,
      label: item.name ?? item.label ?? item.id,
      description: item.description,
      available: preset.is_authenticated,
      availabilityDetail: preset.is_authenticated
        ? undefined
        : providerStatusDetail(preset, 'Sign-in needed'),
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
      providerName: providerDisplayName(activePreset, activeProvider),
      id: activeModel,
      label: activeModel,
      description: undefined,
      available: activePreset?.is_authenticated ?? true,
      availabilityDetail:
        activePreset && !activePreset.is_authenticated
          ? (activePreset.status_message ?? 'Sign-in needed')
          : undefined,
    });
  }
  return options;
}
