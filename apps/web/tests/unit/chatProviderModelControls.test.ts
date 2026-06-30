import { describe, expect, it } from 'vitest';
import type { ProviderDef } from '@clio/core';
import { providersToModelProviders } from '../../src/routes/chatScreenUtils.js';
import { mergeActiveLmProvider } from '../../src/routes/chatModelControls.js';

const providers: ProviderDef[] = [
  {
    id: 'claude_code',
    name: 'Claude Code',
    auth_methods: ['none'],
    is_authenticated: true,
    default_model: 'sonnet',
    metadata: { status: 'ready' },
  },
  {
    id: 'argonne',
    name: 'ALCF',
    auth_methods: ['oauth'],
    is_authenticated: false,
    env_keys: [],
    metadata: { status: 'auth_required' },
  },
  {
    id: 'empty',
    name: 'Empty Provider',
    auth_methods: [],
    is_authenticated: true,
    metadata: {},
  },
];

describe('provider model controls', () => {
  it('maps providers into status-labelled provider groups', () => {
    const groups = providersToModelProviders(providers);

    expect(groups.map((group) => [group.id, group.status, group.disabled])).toEqual([
      ['claude_code', 'ok', false],
      ['argonne', 'setup', true],
      ['empty', 'setup', true],
    ]);
    expect(groups[0]?.models.map((model) => model.id)).toEqual(['claude_code:sonnet']);
  });

  it('merges the live LM model into the matching provider group', () => {
    const groups = mergeActiveLmProvider(providersToModelProviders(providers), {
      provider: 'claude_code',
      model: 'haiku',
    });

    const claude = groups.find((group) => group.id === 'claude_code');
    expect(claude?.models.map((model) => model.id)).toEqual([
      'claude_code:haiku',
      'claude_code:sonnet',
    ]);
    expect(claude?.models[0]?.description).toBe('active model');
  });
});
