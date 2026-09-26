import type { LanguageModelPreset } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import type { ClioModelOption } from '@/lib/model-options';
import { providerGroupStatus, providerGroupsFromOptions } from './model-picker-model';

function preset(overrides: Partial<LanguageModelPreset>): LanguageModelPreset {
  return {
    id: 'p',
    provider_id: '',
    label: 'Provider',
    provider: 'openai',
    litellm_prefix: '',
    requires_api_key: false,
    is_authenticated: false,
    supports_live_catalog: false,
    supports_vision: false,
    configuration_fields: [],
    supports_runtime_sizing: false,
    supports_logout: false,
    ...overrides,
  };
}

/** The one group for `providerPreset` when the service has NO catalog entry for it. */
function presetOnlyGroup(providerPreset: LanguageModelPreset) {
  const [group] = providerGroupsFromOptions([], [providerPreset], true);
  return { health: group!.health, label: providerGroupStatus(group!).label };
}

describe('provider health follows the latest check, never the catalog alone', () => {
  it('a signed-in, verified provider with no catalog entry yet is Ready', () => {
    expect(
      presetOnlyGroup(
        preset({
          id: 'claude_code',
          label: 'Claude Code',
          provider: 'claude_code',
          auth_method: 'subscription',
          is_authenticated: true,
          status: 'ready',
        }),
      ),
    ).toEqual({ health: 'healthy', label: 'Ready' });
  });

  it('names what an unready provider is waiting for', () => {
    expect(
      presetOnlyGroup(preset({ requires_api_key: true, auth_method: 'api_key', status: 'missing_key' })),
    ).toEqual({ health: 'setup', label: 'Needs API key' });
    expect(presetOnlyGroup(preset({ auth_method: 'oauth', status: 'auth_required' }))).toEqual({
      health: 'setup',
      label: 'Needs sign-in',
    });
    expect(
      presetOnlyGroup(preset({ provider: 'claude_code', auth_method: 'subscription', status: 'install_required' })),
    ).toEqual({ health: 'setup', label: 'Needs install' });
    expect(presetOnlyGroup(preset({ is_authenticated: true, status: 'unknown' }))).toEqual({
      health: 'setup',
      label: 'Not checked',
    });
  });

  it('a provider the service reported unavailable is red, not "needs setup"', () => {
    expect(presetOnlyGroup(preset({ is_authenticated: true, status: 'unavailable' }))).toEqual({
      health: 'unavailable',
      label: 'Unavailable',
    });
  });

  it('a catalog row that still needs setup names the need from its preset', () => {
    const option: ClioModelOption = {
      providerId: 'openrouter',
      providerName: 'OpenRouter',
      id: '',
      kind: 'provider',
      label: 'OpenRouter',
      available: false,
      health: 'needs_setup',
    };
    const [group] = providerGroupsFromOptions(
      [option],
      [preset({ id: 'openrouter', requires_api_key: true, auth_method: 'api_key' })],
      false,
    );
    expect(providerGroupStatus(group!).label).toBe('Needs API key');
  });
});
