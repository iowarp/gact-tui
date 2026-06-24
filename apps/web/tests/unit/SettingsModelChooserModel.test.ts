import { describe, expect, it } from 'vitest';
import type { LmPreset } from '@clio/core';
import {
  blockedReasonForPreset,
  chooseInitialPresetId,
  defaultSelectedModel,
  isActiveModelSelection,
  mergeLiveModelOptions,
  providerModelOptions,
  presetStatusLabel,
  presetTone,
  suggestedModelOptions,
} from '../../src/routes/SettingsModelChooserModel.js';

const PRESETS: LmPreset[] = [
  {
    id: 'anthropic',
    label: 'Anthropic API',
    provider: 'anthropic',
    requires_api_key: true,
    api_key_env: 'CLIO_LM_API_KEY',
    auth_method: 'api_key',
    is_authenticated: false,
    status: 'needs_auth',
    suggested_model: 'claude-sonnet',
  },
  {
    id: 'argonne_sophia',
    label: 'ALCF Sophia',
    provider: 'argonne',
    auth_method: 'oauth',
    is_authenticated: true,
    status_message: 'Globus token validated',
    suggested_model: 'openai/gpt-oss-120b',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    provider: 'openai',
    auth_method: 'oauth',
    is_authenticated: false,
    suggested_model: 'openai/gpt-oss-120b:free',
  },
];

describe('SettingsModelChooserModel', () => {
  const anthropic = PRESETS[0]!;
  const sophia = PRESETS[1]!;
  const openrouter = PRESETS[2]!;

  it('prefers the active provider, then the first authenticated preset', () => {
    expect(chooseInitialPresetId(PRESETS, 'anthropic')).toBe('anthropic');
    expect(chooseInitialPresetId(PRESETS, 'argonne')).toBe('argonne_sophia');
    expect(chooseInitialPresetId(PRESETS, 'missing')).toBe('argonne_sophia');
  });

  it('normalizes suggested and live model options without duplicates', () => {
    expect(suggestedModelOptions(sophia)).toEqual([
      {
        id: 'openai/gpt-oss-120b',
        label: 'openai/gpt-oss-120b (suggested)',
      },
    ]);
    expect(
      mergeLiveModelOptions(sophia, [
        { id: 'openai/gpt-oss-120b', label: 'gpt-oss' },
        { id: 'argonne/AuroraGPT-IT-v4', label: 'AuroraGPT' },
      ]),
    ).toEqual([
      { id: 'openai/gpt-oss-120b', label: 'gpt-oss' },
      { id: 'argonne/AuroraGPT-IT-v4', label: 'AuroraGPT' },
    ]);
    expect(mergeLiveModelOptions(sophia, [])).toEqual(suggestedModelOptions(sophia));
    expect(
      providerModelOptions([{ id: 'openai/gpt-oss-120b' }, { id: 'aurora', label: 'Aurora' }]),
    ).toEqual([
      { id: 'openai/gpt-oss-120b', label: 'openai/gpt-oss-120b' },
      { id: 'aurora', label: 'Aurora' },
    ]);
  });

  it('computes default selection, active state, and blocked reasons', () => {
    expect(
      defaultSelectedModel(
        [{ id: 'argonne/AuroraGPT-IT-v4' }, { id: 'openai/gpt-oss-120b' }],
        sophia,
      ),
    ).toBe('openai/gpt-oss-120b');
    expect(
      isActiveModelSelection(sophia, 'argonne', 'openai/gpt-oss-120b', 'openai/gpt-oss-120b'),
    ).toBe(true);
    expect(blockedReasonForPreset(anthropic)).toContain('CLIO_LM_API_KEY');
    expect(blockedReasonForPreset(openrouter)).toContain('sign in');
    expect(blockedReasonForPreset(sophia)).toBeNull();
  });

  it('maps preset status into settings pill copy', () => {
    expect(presetTone(sophia)).toBe('ok');
    expect(presetStatusLabel(sophia)).toBe('Globus token validated');
    expect(presetTone(openrouter)).toBe('warn');
    expect(presetStatusLabel(openrouter)).toBe('needs sign-in');
  });
});
