import type { ReasoningEffort } from '@clio/core/v3';
import { knownReasoningEffort } from '@/lib/reasoning-levels';
/**
 * The model-settings form's own state: what the service's live configuration
 * seeds it with, and what an Apply is allowed to write back.
 *
 * The panel edits one shared backend configuration, so a field it cannot read
 * back from the service must not be invented and then written on the next
 * Apply. Two rules follow, and both live here rather than in the component so
 * they can be asserted directly:
 *
 *   - a field the service does not report is seeded empty, never with a
 *     plausible-looking number;
 *   - an Apply carries the provider identity plus only the fields the person
 *     actually changed, so applying a model choice cannot silently rewrite the
 *     reasoning level, the token cap, or the local runtime's sizing.
 */

import type { LanguageModelConfiguration, LanguageModelPreset, ProviderModel } from '@clio/core/v3';

/** Keep configured models visible, but never promote unverified candidates. */
export function modelSettingsOptions({
  catalog,
  configuration,
  modelId,
  preset,
}: {
  catalog: readonly ProviderModel[];
  configuration: LanguageModelConfiguration;
  modelId: string;
  preset?: LanguageModelPreset;
}): ProviderModel[] {
  const subscription = preset && ['codex', 'claude_code'].includes(preset.provider);
  const configured =
    subscription &&
    presetIsActive(configuration, preset) &&
    modelId &&
    !catalog.some((model) => model.id === modelId)
      ? [{ id: modelId, name: modelId, availability: 'candidate' as const }]
      : [];
  if (catalog.length || subscription) return [...configured, ...catalog];
  return [...new Set([modelId, preset?.suggested_model].filter(Boolean))].map((id) => ({
    id: id as string,
    name: id as string,
  }));
}

/** Only verified subscription providers and complete credentials can be applied. */
export function canApplyProvider(
  preset: LanguageModelPreset | undefined,
  values: ModelSettingsValues,
  storedCredential?: string,
): boolean {
  if (!preset) return false;
  if (
    preset.configuration_fields?.some(
      (field) => field.required && !values.providerOptions[field.id]?.trim(),
    )
  )
    return false;
  return Boolean(
    preset.is_authenticated ||
      (preset.requires_api_key && (values.apiKey || storedCredential)) ||
      (preset.auth_method === 'none' && !['codex', 'claude_code'].includes(preset.provider)),
  );
}

export type { ReasoningEffort } from '@clio/core/v3';

/**
 * Providers whose model runtime this panel can size — the ones that serve a
 * model on the connected agent's own hardware, where parallel slots and a
 * context window are a local capacity decision rather than a hosted service's.
 *
 * This is a capability, and the service is the only thing that actually knows
 * it. Until a preset reports it, the list lives here so at least it is named,
 * documented, and in one place instead of inline in the render; a new local
 * runtime added to the backend has to be added here too, which is the reason
 * this should move to the preset.
 */
const RUNTIME_SIZED_PROVIDERS: readonly string[] = ['vllm', 'lm_studio', 'ollama'];

/** Whether the parallel-slot and context-length controls apply to this preset. */
export function providerSupportsRuntimeSizing(preset?: LanguageModelPreset): boolean {
  return Boolean(
    preset &&
      (preset.supports_runtime_sizing ||
        RUNTIME_SIZED_PROVIDERS.includes(preset.provider_id || preset.provider)),
  );
}

/**
 * The form's fields. Numbers are held as the text the person typed so an empty
 * field stays distinguishable from a real zero.
 */
export interface ModelSettingsValues {
  apiBase: string;
  apiKey: string;
  contextLength: string;
  effort: ReasoningEffort | '';
  maxTokens: string;
  modelId: string;
  parallel: string;
  providerOptions: Record<string, string>;
  temperature: string;
}

/** The body of a configuration write, as the provider repository accepts it. */
export interface ModelSettingsUpdate {
  provider_id: string;
  provider: string;
  api_base: string;
  model: string;
  api_key?: string;
  provider_options: Record<string, string>;
  /** ``null`` clears the configured level back to the model's default. */
  thinking_level?: ReasoningEffort | null;
  parallel?: number;
  context_length?: number;
  max_tokens?: number;
  temperature?: number;
}

/** The preset the service's configuration is currently pointed at, if any. */
export function resolveActivePreset(
  configuration: LanguageModelConfiguration,
): LanguageModelPreset | undefined {
  return (
    configuration.presets.find(
      (preset) =>
        (preset.id === configuration.provider_id || preset.provider === configuration.provider) &&
        (!preset.api_base || preset.api_base === configuration.api_base),
    ) ?? configuration.presets.find((preset) => preset.id === configuration.provider)
  );
}

/** Whether `preset` is the one the service's configuration is already using. */
export function presetIsActive(
  configuration: LanguageModelConfiguration,
  preset?: LanguageModelPreset,
): boolean {
  const active = resolveActivePreset(configuration);
  return Boolean(
    preset && (preset.id === active?.id || (!active && preset.id === configuration.provider)),
  );
}

/** Fills the form from the service's live configuration for one preset. */
export function seedModelSettings({
  configuration,
  preset,
  presetIsActive,
}: {
  configuration: LanguageModelConfiguration;
  preset?: LanguageModelPreset;
  presetIsActive: boolean;
}): ModelSettingsValues {
  return {
    apiBase: presetIsActive ? configuration.api_base : (preset?.api_base ?? ''),
    // Never read back from the service by design, so it always starts empty and
    // an empty field keeps the stored credential.
    apiKey: '',
    // The service reports neither the parallel slot count nor the context
    // length in its configuration, so there is nothing to seed them from. Empty
    // means "leave the runtime's own sizing alone", which is what omitting them
    // from the write does.
    contextLength: '',
    effort: reasoningEffort(configuration.thinking_level),
    maxTokens: numberField(configuration.max_tokens),
    modelId: presetIsActive ? configuration.model : (preset?.suggested_model ?? ''),
    parallel: '',
    providerOptions: presetIsActive ? (configuration.provider_options ?? {}) : {},
    temperature: numberField(configuration.temperature),
  };
}

/**
 * Builds the configuration write for one Apply.
 *
 * The provider, endpoint, and model are the identity the panel exists to set
 * and are always written. Everything else is carried only where it differs from
 * the seeded server state. Clearing a field cannot un-set a stored value — the
 * service's configuration has no way to express "no cap" — so a cleared field
 * leaves the stored one standing rather than writing a substitute.
 */
export function modelSettingsUpdate({
  preset,
  seeded,
  values,
}: {
  preset: LanguageModelPreset;
  seeded: ModelSettingsValues;
  values: ModelSettingsValues;
}): ModelSettingsUpdate {
  const update: ModelSettingsUpdate = {
    provider_id: preset.provider_id || preset.id,
    provider: preset.provider,
    api_base: values.apiBase,
    model: values.modelId,
    provider_options: values.providerOptions,
  };
  if (values.apiKey) update.api_key = values.apiKey;
  if (values.effort !== seeded.effort) update.thinking_level = values.effort || null;
  const parallel = changedNumber(values.parallel, seeded.parallel, { minimum: 0, integer: true });
  if (parallel !== undefined) update.parallel = parallel;
  const contextLength = changedNumber(values.contextLength, seeded.contextLength, {
    minimum: 0,
    integer: true,
  });
  if (contextLength !== undefined) update.context_length = contextLength;
  const maxTokens = changedNumber(values.maxTokens, seeded.maxTokens, {
    minimum: 1,
    integer: true,
  });
  if (maxTokens !== undefined) update.max_tokens = maxTokens;
  const temperature = changedNumber(values.temperature, seeded.temperature, { minimum: 0 });
  if (temperature !== undefined) update.temperature = temperature;
  return update;
}

function reasoningEffort(value: string | undefined): ReasoningEffort | '' {
  return knownReasoningEffort(value) ?? '';
}

function numberField(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

function changedNumber(
  value: string,
  seeded: string,
  bounds: { integer?: boolean; minimum: number },
): number | undefined {
  if (!value.trim() || value === seeded) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < bounds.minimum) return undefined;
  if (bounds.integer && !Number.isInteger(parsed)) return undefined;
  return parsed;
}
