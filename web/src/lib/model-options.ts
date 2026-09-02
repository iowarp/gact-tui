import type {
  LanguageModelPreset,
  ProviderCatalog,
  ProviderCatalogEntry,
  ProviderModel,
} from '@clio/core/v3';
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
  configurationUrl?: string;
  endpoint?: string;
  freshness?: string;
  health?: string;
  /**
   * `provider` marks a row that stands for a provider rather than a model — a
   * provider the service knows about that has no model to choose, so the only
   * thing to show is why. Absent means a real, selectable model.
   */
  kind?: 'model' | 'provider';
  modalities?: readonly string[];
}

/**
 * How each availability the service reports reads to a person.
 *
 * The wire field is an open string, so a token this build has never seen is
 * shown as unknown with the raw token kept beside it rather than either being
 * hidden or printed on its own as if it were product copy.
 */
const MODEL_AVAILABILITY_LABELS: Record<string, string> = {
  available: 'Available',
  candidate: 'Reported but not verified',
  unavailable: 'Unavailable',
};

/** Names one model's reported availability, admitting an unrecognised token. */
export function modelAvailabilityLabel(availability: string): string {
  if (!availability) return 'Unknown';
  return MODEL_AVAILABILITY_LABELS[availability] ?? `Unknown (${availability})`;
}

/**
 * Build the composer catalog without losing an authoritative active model.
 *
 * The live provider catalog and the configured presets are unioned per provider
 * rather than chosen between: the live catalog is authoritative for a provider
 * it reports, and the presets fill in providers it does not know. Taking one
 * list or the other made a configured provider disappear the moment any other
 * provider answered a live handshake.
 */
export function buildModelOptions({
  activeCatalogProvider,
  activeModel,
  activeProvider,
  catalogModels,
  catalogModelsByProvider,
  providerCatalog,
  presets,
}: {
  activeCatalogProvider: string;
  activeModel?: string;
  activeProvider?: string;
  catalogModels?: readonly ProviderModel[];
  catalogModelsByProvider?: Readonly<Record<string, readonly ProviderModel[] | undefined>>;
  providerCatalog?: ProviderCatalog;
  presets: readonly LanguageModelPreset[];
}): ClioModelOption[] {
  const liveProviders = providerCatalog?.providers ?? [];
  const liveProviderIds = new Set(liveProviders.map((provider) => provider.id));
  const liveOptions = liveProviders.flatMap((provider) =>
    liveProviderOptions(
      provider,
      presets.find((preset) => matchesProvider(preset, provider.id)),
    ),
  );
  const presetOptions = presets
    .filter((preset) => !liveProviderIds.has(preset.id) && !liveProviderIds.has(preset.provider))
    .flatMap((preset) => {
      const models = catalogModelsByProvider?.[preset.id]?.length
        ? catalogModelsByProvider[preset.id]
        : preset.id === activeCatalogProvider && catalogModels?.length
          ? catalogModels
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
  const options = [...liveOptions, ...presetOptions];
  if (
    activeProvider &&
    activeModel &&
    !options.some((option) => option.providerId === activeProvider && option.id === activeModel)
  ) {
    const activePreset = presets.find((preset) => matchesProvider(preset, activeProvider));
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

/**
 * One live provider's rows.
 *
 * A provider that reports no models still gets a row of its own, carrying its
 * failure and its configuration link — otherwise a provider that is down is
 * indistinguishable from one that does not exist.
 */
function liveProviderOptions(
  provider: ProviderCatalogEntry,
  preset: LanguageModelPreset | undefined,
): ClioModelOption[] {
  const providerName = provider.name || providerDisplayName(preset, provider.id);
  const shared = {
    providerId: provider.id,
    providerName,
    configurationUrl: provider.configuration_url,
    endpoint: provider.endpoint,
    freshness: provider.freshness.generated_at,
    health: provider.health,
  };
  if (!provider.models.length) {
    return [
      {
        ...shared,
        kind: 'provider',
        id: '',
        label: providerName,
        available: false,
        availabilityDetail:
          provider.failure || 'This provider reported no models to the connected agent.',
      },
    ];
  }
  return provider.models.map((model) => ({
    ...shared,
    kind: 'model',
    id: model.model_id,
    label: conciseModelName(model.model_id),
    description: model.failure || undefined,
    available: model.availability === 'available',
    availabilityDetail:
      model.availability === 'available'
        ? undefined
        : model.failure || modelAvailabilityLabel(model.availability),
    modalities: model.modalities,
  }));
}

function matchesProvider(preset: LanguageModelPreset, providerId: string): boolean {
  return preset.id === providerId || preset.provider === providerId;
}

function conciseModelName(modelId: string): string {
  const segments = modelId.split('/');
  return segments.at(-1) || modelId;
}
