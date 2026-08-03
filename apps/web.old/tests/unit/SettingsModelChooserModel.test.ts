import { describe, expect, it } from 'vitest';
import type { LmPreset } from '@clio/core';
import {
  blockedReasonForPreset,
  chooseInitialPresetId,
  defaultSelectedModel,
  isActiveModelSelection,
  mergeLiveModelOptions,
  normalizeThinkingLevel,
  providerModelOptions,
  presetStatusLabel,
  presetTone,
  suggestedModelOptions,
  THINKING_LEVEL_OPTIONS,
  thinkingLevelForBody,
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

  it('does not offer suggested models as selectable when a provider is blocked', () => {
    expect(defaultSelectedModel([], anthropic)).toBe('');
    expect(blockedReasonForPreset(anthropic)).not.toBeNull();
  });

  it('maps preset status into settings pill copy', () => {
    expect(presetTone(sophia)).toBe('ok');
    expect(presetStatusLabel(sophia)).toBe('Globus token validated');
    expect(presetTone(openrouter)).toBe('warn');
    expect(presetStatusLabel(openrouter)).toBe('needs sign-in');
  });

  it('offers the provider-generic thinking vocabulary as validated options (#895)', () => {
    expect(THINKING_LEVEL_OPTIONS.map((o) => o.value)).toEqual([
      '',
      'off',
      'low',
      'medium',
      'high',
    ]);
    // The default option is the "leave provider default" empty value.
    expect(THINKING_LEVEL_OPTIONS[0]).toEqual({ value: '', label: 'Provider default' });
  });

  it('normalizes any snapshot value to a selector value (#895)', () => {
    expect(normalizeThinkingLevel('high')).toBe('high');
    expect(normalizeThinkingLevel('MEDIUM')).toBe('medium');
    expect(normalizeThinkingLevel('off')).toBe('off');
    // Unknown / legacy / blank → provider default (never throws).
    expect(normalizeThinkingLevel('ultra')).toBe('');
    expect(normalizeThinkingLevel(undefined)).toBe('');
    expect(normalizeThinkingLevel(null)).toBe('');
  });

  it('only emits a valid literal in the request body, else omits it (#895)', () => {
    expect(thinkingLevelForBody('low')).toBe('low');
    expect(thinkingLevelForBody('high')).toBe('high');
    // Provider default and junk both omit the field so the wire never sees ''.
    expect(thinkingLevelForBody('')).toBeUndefined();
    expect(thinkingLevelForBody('ultra')).toBeUndefined();
    expect(thinkingLevelForBody(undefined)).toBeUndefined();
  });
});
