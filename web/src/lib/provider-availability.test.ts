import type { LanguageModelPreset, ProviderDefinition } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { providerAvailability } from './provider-availability';

const definition: ProviderDefinition = {
  id: 'claude_code',
  name: 'Claude Code',
  auth_methods: ['none'],
  is_authenticated: true,
  metadata: {},
};

const preset: LanguageModelPreset = {
  id: 'claude_code',
  label: 'Claude Code',
  provider: 'claude_code',
  requires_api_key: false,
  is_authenticated: false,
  status: 'unavailable',
  status_message: 'claude CLI not found on PATH',
  supports_live_catalog: false,
  supports_vision: false,
};

describe('providerAvailability', () => {
  it('does not let a coarse no-key auth flag override live provider availability', () => {
    expect(providerAvailability(definition, preset)).toEqual({
      label: 'Unavailable',
      value: 'unavailable',
      detail: 'claude CLI not found on PATH',
    });
  });

  it('labels an unchecked local provider without claiming it is ready', () => {
    expect(providerAvailability(undefined, { ...preset, status: 'unknown' })).toMatchObject({
      label: 'Not checked',
      value: 'degraded',
    });
  });
});
