import type { LanguageModelConfiguration, LanguageModelPreset } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { modelSettingsUpdate, seedModelSettings } from './settings-models-form';

const preset: LanguageModelPreset = {
  id: 'lm_studio',
  label: 'LM Studio',
  provider: 'lm_studio',
  api_base: 'http://127.0.0.1:1234/v1',
  suggested_model: 'qwen3-coder',
  requires_api_key: false,
  is_authenticated: true,
  supports_live_catalog: true,
  supports_vision: false,
};

const configuration: LanguageModelConfiguration = {
  configured: true,
  provider: 'lm_studio',
  api_base: 'http://127.0.0.1:1234/v1',
  model: 'qwen3-coder',
  max_tokens: 8_192,
  temperature: 0.3,
  thinking_level: 'high',
  presets: [preset],
};

describe('seedModelSettings', () => {
  it('seeds every field the service reports from the live configuration', () => {
    expect(seedModelSettings({ configuration, preset, presetIsActive: true })).toEqual({
      apiBase: 'http://127.0.0.1:1234/v1',
      apiKey: '',
      contextLength: '',
      effort: 'high',
      maxTokens: '8192',
      modelId: 'qwen3-coder',
      parallel: '',
      temperature: '0.3',
    });
  });

  it('leaves a field the service does not report unset rather than inventing a value', () => {
    const seeded = seedModelSettings({
      configuration: { ...configuration, max_tokens: undefined, temperature: undefined },
      preset,
      presetIsActive: true,
    });

    expect(seeded.maxTokens).toBe('');
    expect(seeded.temperature).toBe('');
  });

  it('offers a non-active preset its own suggestion instead of the active configuration', () => {
    const other: LanguageModelPreset = {
      ...preset,
      id: 'ollama',
      provider: 'ollama',
      api_base: 'http://127.0.0.1:11434/v1',
      suggested_model: 'llama4',
    };

    const seeded = seedModelSettings({ configuration, preset: other, presetIsActive: false });

    expect(seeded.modelId).toBe('llama4');
    expect(seeded.apiBase).toBe('http://127.0.0.1:11434/v1');
    // The output shape is one configuration, so its own reported fields stay seeded.
    expect(seeded.maxTokens).toBe('8192');
  });

  it('treats a reasoning level the service does not report as unset', () => {
    expect(
      seedModelSettings({
        configuration: { ...configuration, thinking_level: undefined },
        preset,
        presetIsActive: true,
      }).effort,
    ).toBe('');
    expect(
      seedModelSettings({
        configuration: { ...configuration, thinking_level: 'ultra' },
        preset,
        presetIsActive: true,
      }).effort,
    ).toBe('');
  });
});

describe('modelSettingsUpdate', () => {
  const seeded = seedModelSettings({ configuration, preset, presetIsActive: true });

  it('submits only the provider identity when nothing else was edited', () => {
    expect(modelSettingsUpdate({ preset, seeded, values: seeded })).toEqual({
      provider: 'lm_studio',
      api_base: 'http://127.0.0.1:1234/v1',
      model: 'qwen3-coder',
    });
  });

  it('never mints a maximum output token cap the service did not report', () => {
    const fresh = seedModelSettings({
      configuration: { ...configuration, max_tokens: undefined },
      preset,
      presetIsActive: true,
    });

    expect(modelSettingsUpdate({ preset, seeded: fresh, values: fresh })).not.toHaveProperty(
      'max_tokens',
    );
  });

  it('leaves the runtime sizing alone when the person did not size it', () => {
    const update = modelSettingsUpdate({
      preset,
      seeded,
      values: { ...seeded, modelId: 'qwen3-next' },
    });

    expect(update).toEqual({
      provider: 'lm_studio',
      api_base: 'http://127.0.0.1:1234/v1',
      model: 'qwen3-next',
    });
    expect(update).not.toHaveProperty('parallel');
    expect(update).not.toHaveProperty('context_length');
    expect(update).not.toHaveProperty('max_tokens');
    expect(update).not.toHaveProperty('temperature');
    expect(update).not.toHaveProperty('thinking_level');
  });

  it('submits each field the person actually edited', () => {
    expect(
      modelSettingsUpdate({
        preset,
        seeded,
        values: {
          ...seeded,
          apiKey: 'secret',
          contextLength: '32768',
          effort: 'low',
          maxTokens: '4096',
          parallel: '2',
          temperature: '0',
        },
      }),
    ).toEqual({
      provider: 'lm_studio',
      api_base: 'http://127.0.0.1:1234/v1',
      model: 'qwen3-coder',
      api_key: 'secret',
      context_length: 32_768,
      max_tokens: 4_096,
      parallel: 2,
      temperature: 0,
      thinking_level: 'low',
    });
  });

  it('ignores an entry that is not a usable number', () => {
    expect(
      modelSettingsUpdate({
        preset,
        seeded,
        values: { ...seeded, maxTokens: 'lots', parallel: '-1' },
      }),
    ).toEqual({
      provider: 'lm_studio',
      api_base: 'http://127.0.0.1:1234/v1',
      model: 'qwen3-coder',
    });
  });
});
