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

import type { LanguageModelConfiguration, LanguageModelPreset } from '@clio/core/v3';

export type ReasoningEffort = 'off' | 'low' | 'medium' | 'high';

/** Reasoning levels the service accepts, in the order the picker offers them. */
export const REASONING_EFFORTS: readonly ReasoningEffort[] = ['off', 'low', 'medium', 'high'];

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
  temperature: string;
}

/** The body of a configuration write, as the provider repository accepts it. */
export interface ModelSettingsUpdate {
  provider: string;
  api_base: string;
  model: string;
  api_key?: string;
  thinking_level?: ReasoningEffort;
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
        preset.provider === configuration.provider &&
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
    provider: preset.provider,
    api_base: values.apiBase,
    model: values.modelId,
  };
  if (values.apiKey) update.api_key = values.apiKey;
  if (values.effort && values.effort !== seeded.effort) update.thinking_level = values.effort;
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
  return REASONING_EFFORTS.includes(value as ReasoningEffort) ? (value as ReasoningEffort) : '';
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
