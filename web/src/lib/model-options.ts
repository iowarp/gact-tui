import type {
  LanguageModelPreset,
  ProviderCatalog,
  ProviderCatalogEntry,
  ProviderCatalogTransport,
  ProviderModel,
} from '@clio/core/v3';
import { providerStatusDetail } from './provider-availability';
import { providerDisplayName } from './provider-presentation';
import { modelReasoningLevels, type ModelReasoningLevels } from './reasoning-levels';

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
  /** Thinking levels this model offers, from the live catalog. */
  reasoning?: ModelReasoningLevels;
  /** CLI values that also select this model (e.g. claude_code's "sonnet"). */
  aliases?: readonly string[];
  /** This provider's OWN transports (Codex: sdk + direct), present on every
   * row from a multi-transport provider so the picker can group by it. */
  transports?: readonly ProviderCatalogTransport[];
  /** Which of `transports` this specific model row came from. */
  transport?: string;
}

/**
 * Whether a catalog model row/option is the one a configured `modelId` names —
 * its own id, one of the provider's own aliases for it (e.g. claude_code's
 * `sonnet` -> `claude-sonnet-5`), or the service's own `resolvedModelId` for
 * the configured value. A model configured by alias must still find its
 * row's reasoning levels and default label (#1436) -- an id-only comparison
 * silently hides them.
 */
export function matchesConfiguredModel(
  candidate: { id: string; aliases?: readonly string[] },
  modelId: string | undefined,
  resolvedModelId?: string,
): boolean {
  if (!modelId) return false;
  if (candidate.id === modelId) return true;
  if (resolvedModelId && candidate.id === resolvedModelId) return true;
  return (candidate.aliases ?? []).includes(modelId);
}

/** The available option naming `providerId`+`modelId` (by id, alias, or resolved id). */
export function findSelectedModelOption<
  T extends { providerId: string; id: string; aliases?: readonly string[]; available: boolean },
>(options: readonly T[], providerId: string | undefined, modelId: string | undefined): T | undefined {
  return options.find(
    (option) => option.providerId === providerId && matchesConfiguredModel(option, modelId) && option.available,
  );
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
    .filter((preset) => !liveProviderIds.has(preset.id))
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
    !options.some(
      (option) =>
        option.providerId === activeProvider && matchesConfiguredModel(option, activeModel),
    )
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
    transports: provider.transports,
  };
  if (!provider.models.length) {
    const authenticationFailure = isAuthenticationFailure(provider.failure);
    const needsAuthentication = (preset && !preset.is_authenticated) || authenticationFailure;
    const isAlcf = /^argonne_/u.test(provider.id) || /\bALCF\b/iu.test(providerName);
    return [
      {
        ...shared,
        kind: 'provider',
        id: '',
        label: providerName,
        available: false,
        availabilityDetail:
          (needsAuthentication
            ? authenticationFailure && isAlcf
              ? 'Sign in to your ALCF account again.'
              : providerStatusDetail(preset, `Sign in to ${providerName} to discover its models.`)
            : provider.failure) || 'This provider reported no models to the connected agent.',
      },
    ];
  }
  const providerReady = preset?.status === 'ready' || preset?.is_authenticated === true;
  const isCliProvider = ['codex', 'claude_code'].includes(provider.kind);
  // The service served this provider's last good list because its live check
  // came back empty: the models are shown, dated, and never presented as current.
  // Dated by the latest live confirmation (the service's confirmed_at), not the
  // list's first discovery -- the date a person reads while the provider is down.
  const confirmedAt = provider.freshness.staleness?.['confirmed_at'];
  const lastGoodDetail =
    provider.freshness.source === 'last_good'
      ? `Last confirmed ${formatCatalogTime(typeof confirmedAt === 'string' && confirmedAt ? confirmedAt : provider.freshness.generated_at)}. Check ${providerName} to confirm it is available now.`
      : undefined;
  return provider.models.map((model) => {
    // CLI providers cannot enumerate models without an explicit (and for
    // Claude potentially billed) discovery run. Their built-in aliases remain
    // candidates, but a runtime the agent reports ready must still be usable;
    // the first real invocation is the final verification boundary.
    const usableCandidate = isCliProvider && model.availability === 'candidate' && providerReady;
    // A last-good model is prior evidence, not a failure: it stays selectable,
    // dated, until a live check replaces it.
    const staleCandidate = Boolean(lastGoodDetail) && model.availability === 'candidate';
    return {
      ...shared,
      kind: 'model',
      id: model.model_id,
      label: conciseModelName(model.model_id),
      description: model.failure || undefined,
      available: model.availability === 'available' || usableCandidate || staleCandidate,
      availabilityDetail:
        model.availability === 'available'
          ? undefined
          : (lastGoodDetail ?? (model.failure || modelAvailabilityLabel(model.availability))),
      modalities: model.modalities,
      reasoning: modelReasoningLevels(model.reasoning),
      aliases: model.aliases,
      transport: model.transport,
    };
  });
}

function formatCatalogTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function isAuthenticationFailure(failure: string | null | undefined): boolean {
  return /(?:\b401\b|unauthori[sz]ed|authentication required|sign[ -]?in required)/iu.test(
    failure ?? '',
  );
}

/**
 * Whether `preset` IS `providerId` -- by its own id only.
 *
 * `preset.provider` is the wire KIND (LiteLLM dialect), never an identity:
 * nine presets share kind "openai" (bedrock, llama_cpp, azure_openai, ...),
 * so matching on it picked whichever same-kind preset the catalog listed
 * first instead of the one actually configured (#1418).
 */
function matchesProvider(preset: LanguageModelPreset, providerId: string): boolean {
  return preset.id === providerId;
}

function conciseModelName(modelId: string): string {
  const segments = modelId.split('/');
  return segments.at(-1) || modelId;
}
