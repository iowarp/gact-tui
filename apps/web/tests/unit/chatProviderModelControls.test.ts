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

  it('uses per-provider model catalogs when available', () => {
    const groups = providersToModelProviders(providers, {
      claude_code: {
        models: [
          { id: 'haiku', name: 'Claude Haiku' },
          { id: 'sonnet', name: 'Claude Sonnet' },
          { id: 'opus', name: 'Claude Opus' },
        ],
      },
    });

    const claude = groups.find((group) => group.id === 'claude_code');
    expect(claude?.models.map((model) => model.id)).toEqual([
      'claude_code:haiku',
      'claude_code:sonnet',
      'claude_code:opus',
    ]);
  });

  it('marks unavailable live catalogs offline instead of falling back to defaults', () => {
    const groups = providersToModelProviders(
      [
        {
          id: 'ollama',
          name: 'Ollama',
          auth_methods: ['none'],
          is_authenticated: true,
          default_model: 'granite3.1-dense:8b',
          metadata: {},
        },
      ],
      {
        ollama: {
          models: [],
          source: 'unavailable',
          error: 'ConnectError: All connection attempts failed',
        },
      },
    );

    expect(groups[0]?.status).toBe('offline');
    expect(groups[0]?.disabled).toBe(true);
    expect(groups[0]?.models).toEqual([]);
  });

  it('keeps known providers in the designed picker order independent of status', () => {
    const groups = providersToModelProviders(
      [
        { id: 'lm_studio', name: 'LM Studio', is_authenticated: true, default_model: 'local' },
        { id: 'openai', name: 'OpenAI / ChatGPT', is_authenticated: true, default_model: 'gpt' },
        { id: 'claude_code', name: 'Claude Code', is_authenticated: true, default_model: 'haiku' },
        { id: 'ollama', name: 'Ollama', is_authenticated: true, default_model: 'granite' },
        { id: 'codex', name: 'OpenAI Codex', is_authenticated: true, default_model: 'gpt-5.5' },
        { id: 'openrouter', name: 'OpenRouter', is_authenticated: true, default_model: 'free' },
        { id: 'anthropic', name: 'Anthropic API', is_authenticated: true, default_model: 'sonnet' },
      ],
      {
        openai: { models: [], source: 'unavailable', error: 'offline' },
        openrouter: { models: [], source: 'unavailable', error: 'offline' },
        anthropic: { models: [], source: 'unavailable', error: 'offline' },
        ollama: { models: [], source: 'unavailable', error: 'offline' },
      },
    );

    expect(groups.map((group) => group.id)).toEqual([
      'claude_code',
      'codex',
      'anthropic',
      'openai',
      'openrouter',
      'lm_studio',
      'ollama',
    ]);
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
