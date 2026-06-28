/**
 * State model for the settings model chooser: provider/model selection and the
 * filtered, grouped catalog it presents.
 */
import type { LmPreset } from '@clio/core';
import type { PillTone } from '../components/SettingsPrimitives.js';

export interface ModelOption {
  id: string;
  label?: string;
}

export function chooseInitialPresetId(
  presets: LmPreset[],
  activeProvider: string | undefined,
): string {
  const byActive = presets.find((p) => p.provider === activeProvider || p.id === activeProvider);
  const firstAuthed = presets.find((p) => p.is_authenticated);
  return (byActive ?? firstAuthed ?? presets[0])?.id ?? '';
}

export function findPresetById(presets: LmPreset[], selectedId: string): LmPreset | undefined {
  return presets.find((p) => p.id === selectedId);
}

export function suggestedModelOptions(preset: LmPreset | undefined): ModelOption[] {
  if (!preset?.suggested_model) return [];
  return [{ id: preset.suggested_model, label: `${preset.suggested_model} (suggested)` }];
}

export function providerModelOptions(models: Array<{ id: string; label?: string }>): ModelOption[] {
  return models.map((model) => ({
    id: model.id,
    label: model.label ?? model.id,
  }));
}

export function mergeLiveModelOptions(
  preset: LmPreset | undefined,
  liveModels: ModelOption[],
): ModelOption[] {
  const suggested = suggestedModelOptions(preset);
  if (liveModels.length === 0) return suggested;
  if (preset?.suggested_model && !liveModels.some((m) => m.id === preset.suggested_model)) {
    return [...suggested, ...liveModels];
  }
  return liveModels;
}

export function defaultSelectedModel(
  models: ModelOption[] | undefined,
  preset: LmPreset | undefined,
): string {
  if (!models || models.length === 0) return '';
  return models.find((m) => m.id === preset?.suggested_model)?.id ?? models[0]?.id ?? '';
}

export function isActiveModelSelection(
  preset: LmPreset | undefined,
  activeProvider: string | undefined,
  activeModel: string | undefined,
  selectedModel: string,
): boolean {
  return (
    !!preset &&
    (preset.provider === activeProvider || preset.id === activeProvider) &&
    selectedModel === activeModel
  );
}

export function blockedReasonForPreset(preset: LmPreset | undefined): string | null {
  if (!preset) return 'Pick a provider to continue.';
  if (preset.is_authenticated) return null;
  if (preset.requires_api_key) {
    return `This provider needs an API key. Set ${preset.api_key_env ?? 'the provider key'} on the backend, then refresh.`;
  }
  if ((preset.auth_method ?? 'none') === 'oauth') {
    return 'This provider needs you to sign in before it can run.';
  }
  return null;
}

export function presetTone(preset: LmPreset): PillTone {
  if (preset.is_authenticated) return 'ok';
  if ((preset.auth_method ?? 'none') !== 'none') return 'warn';
  return 'neutral';
}

export function presetStatusLabel(preset: LmPreset): string {
  if (preset.status_message) return preset.status_message;
  if (preset.status) return preset.status;
  if (preset.is_authenticated) return 'ready';
  if (preset.requires_api_key) return 'needs API key';
  if ((preset.auth_method ?? 'none') === 'oauth') return 'needs sign-in';
  return 'ready';
}
