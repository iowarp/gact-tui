import type { RuntimeSetting } from '@clio/core/v3';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from '@/i18n/instance';
import { SOURCE_LOCALE } from '@/i18n/locales';
import { RESPONSE_SETTING_DESCRIPTIONS, RESPONSE_SETTING_LABELS } from './settings-models-form';
import {
  localizeProviderOption,
  localizeRuntimeSetting,
  PROVIDER_OPTION_COPY,
  RUNTIME_SETTING_COPY,
  runtimeGroupLabel,
} from './settings-schema-copy';

/**
 * What clio-agent sends today (develop c2a35729e): runtime settings from
 * `gact/runtime_settings.py` `_DEFINITIONS`, with their choice and preset
 * values. Add a key here, and its copy, when the agent adds a setting.
 */
const AGENT_RUNTIME_SETTINGS: Record<string, { choices?: string[]; presets?: number[] }> = {
  'agent_tasks.max_concurrent': {},
  'agent_tasks.max_depth': {},
  'agent_tasks.max_forks_per_task': {},
  'workflows.max_added_steps': {},
  'workflows.max_edit_rounds': {},
  'limits.lm_call_s': {},
  'limits.lm_inter_token_idle_s': {},
  'tools.mcp.call_timeout_s': {},
  'limits.lm_transient_retries': {},
  'autocompact.pct': {},
  'runtime.capture_reasoning': {},
  'transcript.file': {},
  'memory.enabled': {},
  'memory.background': {},
  'memory.session_search': {},
  'memory.sensitive': {},
  'memory.auto_accept': { choices: ['user_stated', 'all', 'none'] },
  'memory.idle_minutes': { presets: [0, 5, 15, 30, 60] },
  'memory.expiry_days': { presets: [0, 30, 60, 90, 180, 365] },
  'browser.backend': { choices: ['managed', 'cdp'] },
  'browser.channel': { choices: ['chromium', 'chrome', 'msedge'] },
  'browser.cdp_url': {},
};
const AGENT_GROUPS = ['Subagents', 'Workflows', 'Execution', 'Memory & history', 'Memory', 'Browser'];
/** `providers/capabilities/accepted_parameters.py` `TUNABLES` names. */
const AGENT_RESPONSE_SETTINGS = [
  'temperature',
  'top_p',
  'top_k',
  'min_p',
  'presence_penalty',
  'frequency_penalty',
  'repetition_penalty',
  'max_tokens',
  'context_length',
  'seed',
  'parallel',
];
/** `providers/catalog.py` `ProviderConfigurationField` ids. */
const AGENT_PROVIDER_OPTIONS: Record<string, string[]> = {
  api_version: [],
  vertex_project: [],
  vertex_location: [],
  aws_region_name: [],
  aws_profile_name: [],
  show_diffusion: ['off', 'on'],
};

function setting(key: string, overrides: Partial<RuntimeSetting> = {}): RuntimeSetting {
  return {
    key,
    title: 'Agent title',
    description: 'Agent description',
    group: 'Subagents',
    value: 1,
    default_value: 1,
    kind: 'integer',
    minimum: 0,
    maximum: null,
    unit: null,
    effect: 'Agent effect',
    source: 'default',
    has_user_value: false,
    editable: true,
    reason: null,
    choices: [],
    ...overrides,
  };
}

function activateTranslatedLocale() {
  i18n.load('el', {});
  i18n.activate('el');
}

afterEach(() => i18n.activate(SOURCE_LOCALE));

describe('agent settings copy', () => {
  it('covers every runtime setting, choice and preset the agent sends', () => {
    for (const [key, { choices = [], presets = [] }] of Object.entries(AGENT_RUNTIME_SETTINGS)) {
      const copy = RUNTIME_SETTING_COPY[key];
      expect(copy, key).toBeDefined();
      expect(copy?.title && copy.description && copy.effect, key).toBeTruthy();
      for (const choice of choices) expect(copy?.choices?.[choice], `${key}=${choice}`).toBeTruthy();
      for (const preset of presets) expect(copy?.presets?.[preset], `${key}=${preset}`).toBeTruthy();
    }
    expect(Object.keys(RUNTIME_SETTING_COPY).sort()).toEqual(
      Object.keys(AGENT_RUNTIME_SETTINGS).sort(),
    );
  });

  it('covers every group, response setting and provider option the agent sends', () => {
    activateTranslatedLocale();
    for (const group of AGENT_GROUPS) expect(runtimeGroupLabel(group)).toBeTruthy();
    expect(Object.keys(RESPONSE_SETTING_LABELS).sort()).toEqual([...AGENT_RESPONSE_SETTINGS].sort());
    expect(Object.keys(RESPONSE_SETTING_DESCRIPTIONS).sort()).toEqual(
      [...AGENT_RESPONSE_SETTINGS].sort(),
    );
    expect(Object.keys(PROVIDER_OPTION_COPY).sort()).toEqual(
      Object.keys(AGENT_PROVIDER_OPTIONS).sort(),
    );
    for (const [id, options] of Object.entries(AGENT_PROVIDER_OPTIONS))
      for (const option of options)
        expect(PROVIDER_OPTION_COPY[id]?.options?.[option], `${id}=${option}`).toBeTruthy();
  });

  it('shows the interface-language copy for a known key, keeping its key, group and value', () => {
    activateTranslatedLocale();
    const shown = localizeRuntimeSetting(
      setting('memory.auto_accept', {
        group: 'Memory',
        kind: 'choice',
        value: 'all',
        reason: "Set by the connected service's workspace configuration.",
        choices: [
          { value: 'all', label: 'Agent all' },
          { value: 'later', label: 'A choice added later' },
        ],
      }),
    );
    expect(shown).toMatchObject({
      key: 'memory.auto_accept',
      group: 'Memory',
      value: 'all',
      title: 'Apply background changes without review',
      effect: 'Applies to proposals made after the change.',
      reason: "Set by the connected service's workspace configuration.",
      choices: [
        { value: 'all', label: 'All new and updated memories' },
        { value: 'later', label: 'A choice added later' },
      ],
    });
    expect(runtimeGroupLabel('Memory')).toBe('Memory');
  });

  it("falls back to the agent's text for an unknown key, group or provider option", () => {
    activateTranslatedLocale();
    const unknown = setting('limits.added_later', {
      reason: 'A reason added later.',
      presets: [{ value: 5, label: 'Five' }],
    });
    expect(localizeRuntimeSetting(unknown)).toEqual(unknown);
    expect(runtimeGroupLabel('Added later')).toBe('Added later');
    const option = localizeProviderOption({ id: 'added_later', label: 'Agent label' });
    expect(option.label).toBe('Agent label');
    expect(option.description).toBeUndefined();
    expect(option.option('fast')).toBe('fast');
  });

  it("shows the agent's own English text in the source language", () => {
    const sent = setting('agent_tasks.max_depth', { title: 'Nesting depth, as reworded' });
    expect(localizeRuntimeSetting(sent).title).toBe('Nesting depth, as reworded');
    expect(localizeProviderOption({ id: 'show_diffusion', label: 'Show diffusion' }).option('on')).toBe(
      'on',
    );
  });
});
