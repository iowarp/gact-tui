import type { ReasoningEffort } from '@clio/core/v3';
import { knownReasoningEffort } from '@/lib/reasoning-levels';
/**
 * The model-settings form's own state: what the service's live configuration
 * seeds it with, and what an Apply writes back.
 *
 * The panel edits one shared backend configuration. Three rules follow, and
 * all live here rather than in the component so they can be asserted directly:
 *
 *   - a field the service does not report is seeded empty, never with a
 *     plausible-looking number;
 *   - an Apply carries the provider identity plus EVERY saved response
 *     setting: the service replaces the whole set on each write, so leaving a
 *     saved value out would silently drop it (and an emptied field is how a
 *     person puts a setting back to the default);
 *   - the reasoning level is written only when the person changed it (the
 *     service carries a person's level over on its own).
 *
 * Which settings the form SHOWS is the selected model's own
 * `accepted_parameters`; a saved value the model does not accept is kept and
 * reported as not used, and the service never sends it.
 */

import type {
  AcceptedParameter,
  LanguageModelConfiguration,
  LanguageModelPreset,
} from '@clio/core/v3';

export type { ReasoningEffort } from '@clio/core/v3';

/**
 * The response settings the service stores and reports on its configuration,
 * with the name a "not used by this model" note gives a saved value. A model
 * offers a subset of these through its `accepted_parameters`; the label here
 * is only for a saved value the current model does not offer (and so did not
 * describe).
 */
export const RESPONSE_SETTING_LABELS = {
  temperature: 'Temperature',
  top_p: 'Top P',
  top_k: 'Top K',
  min_p: 'Min P',
  presence_penalty: 'Presence penalty',
  frequency_penalty: 'Frequency penalty',
  repetition_penalty: 'Repetition penalty',
  max_tokens: 'Longest reply',
  context_length: 'Context size',
  seed: 'Seed',
  parallel: 'Replies at once',
} as const;

export type ResponseSettingName = keyof typeof RESPONSE_SETTING_LABELS;

export const RESPONSE_SETTING_NAMES = Object.keys(RESPONSE_SETTING_LABELS) as ResponseSettingName[];

/** Settings whose empty value the service spells 0 (a size), not null. */
const SIZE_SETTINGS: ReadonlySet<ResponseSettingName> = new Set([
  'max_tokens',
  'context_length',
  'parallel',
]);

/**
 * The form's fields. Numbers are held as the text the person typed so an empty
 * field stays distinguishable from a real zero.
 */
export interface ModelSettingsValues {
  apiBase: string;
  effort: ReasoningEffort | '';
  modelId: string;
  providerOptions: Record<string, string>;
  /** Saved response settings by name; empty means unset (the default applies). */
  settings: Partial<Record<ResponseSettingName, string>>;
}

/** The body of a configuration write, as the provider repository accepts it. */
export interface ModelSettingsUpdate extends Partial<Record<ResponseSettingName, number>> {
  provider_id: string;
  provider: string;
  api_base: string;
  model: string;
  api_key?: string;
  provider_options: Record<string, string>;
  /** ``null`` clears the configured level back to the model's default. */
  thinking_level?: ReasoningEffort | null;
}

/**
 * The preset the service's configuration is currently pointed at, if any.
 *
 * Matches `configuration.provider_id` only. `configuration.provider` is the
 * wire KIND (LiteLLM dialect) nine presets share (bedrock, llama_cpp,
 * azure_openai, ...), so matching on it -- as a primary key or a fallback --
 * silently resolved to the WRONG preset (#1418).
 */
export function resolveActivePreset(
  configuration: LanguageModelConfiguration,
): LanguageModelPreset | undefined {
  return configuration.presets.find(
    (preset) =>
      preset.id === configuration.provider_id &&
      (!preset.api_base || preset.api_base === configuration.api_base),
  );
}

/** Whether `preset` is the one the service's configuration is already using. */
export function presetIsActive(
  configuration: LanguageModelConfiguration,
  preset?: LanguageModelPreset,
): boolean {
  const active = resolveActivePreset(configuration);
  return Boolean(preset && preset.id === active?.id);
}

/** The saved response settings the service reports, as form text. */
export function savedResponseSettings(
  configuration: LanguageModelConfiguration,
): ModelSettingsValues['settings'] {
  const settings: ModelSettingsValues['settings'] = {};
  for (const name of RESPONSE_SETTING_NAMES) {
    const value = configuration[name];
    // The service echoes 0 for a temperature nobody set (its own default, not
    // a choice), so 0 there reads as "Provider default".
    if (value === undefined || (name === 'temperature' && value === 0)) continue;
    settings[name] = String(value);
  }
  return settings;
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
    // Only a level a person set is a choice; a shipped/provider default is shown
    // by the field's "Default" option and never written back on Apply.
    effort:
      configuration.thinking_level_source === 'user'
        ? reasoningEffort(configuration.thinking_level)
        : '',
    modelId: presetIsActive ? configuration.model : (preset?.suggested_model ?? ''),
    providerOptions: presetIsActive ? (configuration.provider_options ?? {}) : {},
    settings: savedResponseSettings(configuration),
  };
}

/**
 * The saved settings the selected model does not accept: kept, never sent,
 * and shown as "not used by this model". `accepted` undefined means the model's
 * accepted set is not known yet, so nothing is called unused.
 */
export function unusedResponseSettings(
  settings: ModelSettingsValues['settings'],
  accepted: readonly string[] | undefined,
): Array<{ name: ResponseSettingName; label: string; value: string }> {
  if (!accepted) return [];
  return RESPONSE_SETTING_NAMES.flatMap((name) => {
    const value = settings[name]?.trim();
    if (!value || accepted.includes(name)) return [];
    return [{ name, label: RESPONSE_SETTING_LABELS[name], value }];
  });
}

/** Up to this many settings show inline; more go behind one grouped disclosure. */
export const INLINE_SETTINGS_LIMIT = 4;

/** The accepted settings this form can store and send (a name it knows). */
export function shownResponseParameters(
  parameters: AcceptedParameter[] | undefined,
): Array<AcceptedParameter & { name: ResponseSettingName }> {
  return (parameters ?? []).filter(
    (parameter): parameter is AcceptedParameter & { name: ResponseSettingName } =>
      (RESPONSE_SETTING_NAMES as readonly string[]).includes(parameter.name),
  );
}

/**
 * Whether the card has anything to show for this model: a setting it accepts,
 * or a saved value it does not use. A model that takes no response settings
 * and has none saved gets no section at all.
 */
export function responseSettingsVisible(
  parameters: AcceptedParameter[] | undefined,
  settings: ModelSettingsValues['settings'],
): boolean {
  return (
    shownResponseParameters(parameters).length > 0 ||
    unusedResponseSettings(
      settings,
      parameters?.map((parameter) => parameter.name),
    ).length > 0
  );
}

/**
 * Builds the configuration write for one Apply: the identity, every saved
 * response setting that is a usable number, and the reasoning level only when
 * it changed from the seeded one.
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
  if (values.effort !== seeded.effort) update.thinking_level = values.effort || null;
  for (const name of RESPONSE_SETTING_NAMES) {
    const value = settingNumber(name, values.settings[name]);
    if (value !== undefined) update[name] = value;
  }
  return update;
}

/**
 * The response settings to carry onto a newly chosen model. A longest reply
 * above the new model's context window cannot be served (vLLM refuses every
 * request: "max_tokens=32000 cannot be greater than max_model_len=4096"), so
 * it is dropped and the model's own limit applies; the field then shows the
 * provider default instead of a value the model rejects.
 */
export function settingsForChosenModel(
  settings: ModelSettingsValues['settings'],
  contextWindow: number | undefined,
): ModelSettingsValues['settings'] {
  const longest = Number(settings.max_tokens);
  if (!contextWindow || !Number.isFinite(longest) || longest <= contextWindow) return settings;
  const { max_tokens: _tooLong, ...rest } = settings;
  return rest;
}

function reasoningEffort(value: string | undefined): ReasoningEffort | '' {
  return knownReasoningEffort(value) ?? '';
}

function settingNumber(name: ResponseSettingName, text: string | undefined): number | undefined {
  if (!text?.trim()) return undefined;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return undefined;
  // A size is a positive whole number; 0 is how the service spells "unset".
  if (SIZE_SETTINGS.has(name) && (!Number.isInteger(parsed) || parsed <= 0)) return undefined;
  return parsed;
}
