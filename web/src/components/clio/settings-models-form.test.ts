import type { LanguageModelConfiguration, LanguageModelPreset } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import {
  modelSettingsUpdate,
  seedModelSettings,
  unusedResponseSettings,
} from './settings-models-form';

const preset: LanguageModelPreset = {
  id: 'lm_studio',
  label: 'LM Studio',
  provider: 'lm_studio',
  provider_id: 'lm_studio',
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
  top_k: 20,
  context_length: 32_768,
  thinking_level: 'high',
  thinking_level_source: 'user',
  presets: [preset],
};

const identity = {
  provider: 'lm_studio',
  provider_id: 'lm_studio',
  provider_options: {},
  api_base: 'http://127.0.0.1:1234/v1',
  model: 'qwen3-coder',
};

describe('seedModelSettings', () => {
  it('seeds every saved response setting the service reports', () => {
    expect(seedModelSettings({ configuration, preset, presetIsActive: true })).toEqual({
      apiBase: 'http://127.0.0.1:1234/v1',
      effort: 'high',
      modelId: 'qwen3-coder',
      providerOptions: {},
      settings: { context_length: '32768', max_tokens: '8192', temperature: '0.3', top_k: '20' },
    });
  });

  it('leaves a setting the service does not report unset rather than inventing a value', () => {
    const seeded = seedModelSettings({
      configuration: { ...configuration, max_tokens: undefined, temperature: undefined },
      preset,
      presetIsActive: true,
    });

    expect(seeded.settings).not.toHaveProperty('max_tokens');
    expect(seeded.settings).not.toHaveProperty('temperature');
  });

  it("reads the service's echoed 0 temperature as the provider default, never 0", () => {
    const seeded = seedModelSettings({
      configuration: { ...configuration, temperature: 0 },
      preset,
      presetIsActive: true,
    });

    expect(seeded.settings).not.toHaveProperty('temperature');
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
    // One configuration, one saved set: it follows the person to the new model.
    expect(seeded.settings.max_tokens).toBe('8192');
  });

  it('treats a reasoning level the service does not report as unset', () => {
    expect(
      seedModelSettings({
        configuration: { ...configuration, thinking_level: undefined },
        preset,
        presetIsActive: true,
      }).effort,
    ).toBe('');
    // "omega" (not "ultra" -- #1436 added that as a real, recognized level)
    // is junk no provider will ever report.
    expect(
      seedModelSettings({
        configuration: { ...configuration, thinking_level: 'omega' },
        preset,
        presetIsActive: true,
      }).effort,
    ).toBe('');
  });
});

describe('modelSettingsUpdate', () => {
  const seeded = seedModelSettings({ configuration, preset, presetIsActive: true });

  it('writes the whole saved set back, because the service replaces it on every write', () => {
    expect(modelSettingsUpdate({ preset, seeded, values: seeded })).toEqual({
      ...identity,
      context_length: 32_768,
      max_tokens: 8_192,
      temperature: 0.3,
      top_k: 20,
    });
  });

  it('a model change keeps every saved setting', () => {
    const update = modelSettingsUpdate({
      preset,
      seeded,
      values: { ...seeded, modelId: 'qwen3-next' },
    });

    expect(update).toMatchObject({ model: 'qwen3-next', temperature: 0.3, top_k: 20 });
    expect(update).not.toHaveProperty('thinking_level');
  });

  it('an emptied field puts that setting back to the default by leaving it out', () => {
    const update = modelSettingsUpdate({
      preset,
      seeded,
      values: { ...seeded, settings: { ...seeded.settings, temperature: '', top_k: '  ' } },
    });

    expect(update).not.toHaveProperty('temperature');
    expect(update).not.toHaveProperty('top_k');
    expect(update.max_tokens).toBe(8_192);
  });

  it('submits each newly entered setting, a real zero included', () => {
    const fresh = seedModelSettings({
      configuration: {
        ...configuration,
        temperature: undefined,
        top_k: undefined,
        max_tokens: undefined,
        context_length: undefined,
      },
      preset,
      presetIsActive: true,
    });
    expect(
      modelSettingsUpdate({
        preset,
        seeded: fresh,
        values: {
          ...fresh,
          effort: 'low',
          settings: { min_p: '0', seed: '7', parallel: '2', repetition_penalty: '1.1' },
        },
      }),
    ).toEqual({
      ...identity,
      min_p: 0,
      seed: 7,
      parallel: 2,
      repetition_penalty: 1.1,
      thinking_level: 'low',
    });
  });

  it('ignores an entry that is not a usable number, and a size that is not a positive whole number', () => {
    const update = modelSettingsUpdate({
      preset,
      seeded,
      values: {
        ...seeded,
        settings: { max_tokens: 'lots', parallel: '-1', context_length: '0', top_p: 'x' },
      },
    });

    expect(update).toEqual(identity);
  });

  it('submits stable provider identity and typed LiteLLM options', () => {
    const azure = {
      ...preset,
      id: 'azure_openai',
      provider: 'openai',
      provider_id: 'azure_openai',
      configuration_fields: [
        {
          id: 'api_version',
          label: 'API version',
          required: true,
        },
      ],
    } satisfies LanguageModelPreset;
    const azureSeeded = seedModelSettings({
      configuration,
      preset: azure,
      presetIsActive: false,
    });

    expect(
      modelSettingsUpdate({
        preset: azure,
        seeded: azureSeeded,
        values: {
          ...azureSeeded,
          modelId: 'deployment',
          providerOptions: { api_version: '2024-10-21' },
        },
      }),
    ).toMatchObject({
      provider: 'openai',
      provider_id: 'azure_openai',
      provider_options: { api_version: '2024-10-21' },
    });
  });
});

describe('unusedResponseSettings', () => {
  const settings = { temperature: '0.7', top_k: '20', seed: '' };

  it('lists the saved values the model does not accept, labelled', () => {
    expect(unusedResponseSettings(settings, ['temperature'])).toEqual([
      { name: 'top_k', label: 'Top K', value: '20' },
    ]);
  });

  it('calls nothing unused while the model accepted set is unknown', () => {
    expect(unusedResponseSettings(settings, undefined)).toEqual([]);
  });

  it('a model that accepts none leaves every saved value unused', () => {
    expect(unusedResponseSettings(settings, []).map((item) => item.name)).toEqual([
      'temperature',
      'top_k',
    ]);
  });
});

describe('modelSettingsUpdate reasoning level', () => {
  const seeded = seedModelSettings({ configuration, preset, presetIsActive: true });

  it('leaves an unchanged level out of the write (the service keeps it)', () => {
    expect(modelSettingsUpdate({ preset, seeded, values: seeded })).not.toHaveProperty(
      'thinking_level',
    );
  });

  it('clears a configured level back to the model default with null', () => {
    const update = modelSettingsUpdate({ preset, seeded, values: { ...seeded, effort: '' } });
    expect(update.thinking_level).toBeNull();
  });

  it('writes a newly chosen level', () => {
    const update = modelSettingsUpdate({ preset, seeded, values: { ...seeded, effort: 'max' } });
    expect(update.thinking_level).toBe('max');
  });
});

describe('the sonnet -> opus Apply', () => {
  const claude: LanguageModelPreset = {
    ...preset,
    id: 'claude_code',
    provider: 'claude_code',
    provider_id: 'claude_code',
    suggested_model: 'sonnet',
  };
  const sonnet: LanguageModelConfiguration = {
    configured: true,
    provider: 'claude_code',
    api_base: '',
    model: 'sonnet',
    // CLIO's shipped default for sonnet -- nobody chose it.
    thinking_level: 'low',
    presets: [claude],
  };

  it("does not seed a shipped default as the person's level", () => {
    expect(
      seedModelSettings({ configuration: sonnet, preset: claude, presetIsActive: true }).effort,
    ).toBe('');
  });

  it('switching to opus writes no level, so opus runs on its own default', () => {
    const seeded = seedModelSettings({
      configuration: sonnet,
      preset: claude,
      presetIsActive: true,
    });
    const update = modelSettingsUpdate({
      preset: claude,
      seeded,
      values: { ...seeded, modelId: 'opus' },
    });
    expect(update.model).toBe('opus');
    expect(update).not.toHaveProperty('thinking_level');
  });
});
