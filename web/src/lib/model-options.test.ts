import type { LanguageModelPreset, ProviderCatalog, ProviderCatalogEntry } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildModelOptions, modelAvailabilityLabel } from './model-options';

function catalogProvider(overrides: Partial<ProviderCatalogEntry> = {}): ProviderCatalogEntry {
  return {
    id: 'codex',
    name: 'OpenAI Codex',
    kind: 'codex_sdk',
    endpoint: 'local://codex-sdk',
    configuration_url: '/settings/providers?provider=codex',
    connectivity: 'reachable',
    auth: 'ready',
    health: 'ready',
    freshness: { generated_at: '2026-08-31T12:00:00Z', source: 'live' },
    failure: '',
    models: [],
    ...overrides,
  };
}

function catalogModel(modelId: string, availability = 'available', failure = '') {
  return {
    provider_id: 'codex',
    provider_kind: 'codex_sdk',
    endpoint: 'local://codex-sdk',
    deployment: '',
    model_id: modelId,
    revision: '',
    modalities: ['text'],
    reasoning: { supported: true, parameter: 'reasoning_effort' },
    native_tool_calling: true,
    availability,
    evidence: {
      source: 'live',
      generated_at: '2026-08-31T12:00:00Z',
      live: true,
      context_source: 'provider',
    },
    failure,
  };
}

const lmStudioPreset: LanguageModelPreset = {
  id: 'lm_studio',
  label: 'LM Studio',
  provider: 'lm_studio',
  suggested_model: 'qwen3-coder',
  requires_api_key: false,
  is_authenticated: true,
  supports_live_catalog: true,
  supports_vision: false,
};

describe('buildModelOptions', () => {
  it('does not expose suggested defaults as live selectable inventory', () => {
    expect(
      buildModelOptions({
        activeCatalogProvider: '',
        presets: [
          {
            id: 'codex',
            label: 'Codex',
            provider: 'codex',
            suggested_model: 'hardcoded-default',
            is_authenticated: true,
            requires_api_key: false,
            supports_live_catalog: true,
            supports_vision: true,
          },
        ],
      }),
    ).toEqual([]);
  });

  it('uses the live endpoint catalog and keeps provider and model identity separate', () => {
    const providerCatalog: ProviderCatalog = {
      authoritative: 'live_handshake',
      providers: [
        {
          id: 'codex',
          name: 'OpenAI Codex',
          kind: 'codex_sdk',
          endpoint: 'local://codex-sdk',
          configuration_url: '/settings/providers/codex',
          connectivity: 'reachable',
          auth: 'ready',
          health: 'ready',
          freshness: { generated_at: '2026-08-31T12:00:00Z', source: 'live' },
          failure: '',
          models: [
            {
              provider_id: 'codex',
              provider_kind: 'codex_sdk',
              endpoint: 'local://codex-sdk',
              deployment: '',
              model_id: 'openai/gpt-5.6-luna',
              revision: '',
              modalities: ['text', 'image'],
              reasoning: { supported: true, parameter: 'reasoning_effort' },
              native_tool_calling: true,
              availability: 'available',
              evidence: {
                source: 'live',
                generated_at: '2026-08-31T12:00:00Z',
                live: true,
                context_source: 'provider',
              },
              failure: '',
            },
          ],
        },
      ],
    };

    expect(
      buildModelOptions({
        activeCatalogProvider: 'codex',
        activeModel: 'openai/gpt-5.6-luna',
        activeProvider: 'codex',
        providerCatalog,
        presets: [],
      }),
    ).toEqual([
      expect.objectContaining({
        providerId: 'codex',
        id: 'openai/gpt-5.6-luna',
        label: 'gpt-5.6-luna',
        configurationUrl: '/settings/providers/codex',
        available: true,
        modalities: ['text', 'image'],
      }),
    ]);
  });

  it('keeps a configured provider the live catalog does not know about', () => {
    const options = buildModelOptions({
      activeCatalogProvider: 'lm_studio',
      catalogModelsByProvider: { lm_studio: [{ id: 'qwen3-coder', name: 'Qwen3 Coder' }] },
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [catalogProvider({ models: [catalogModel('openai/gpt-5.6-luna')] })],
      },
      presets: [lmStudioPreset],
    });

    expect(options.map((option) => `${option.providerId}:${option.id}`)).toEqual([
      'codex:openai/gpt-5.6-luna',
      'lm_studio:qwen3-coder',
    ]);
  });

  it('lets the live catalog win for a provider the presets also describe', () => {
    const options = buildModelOptions({
      activeCatalogProvider: 'codex',
      catalogModels: [{ id: 'stale-preset-model', name: 'Stale' }],
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [catalogProvider({ models: [catalogModel('openai/gpt-5.6-luna')] })],
      },
      presets: [
        {
          ...lmStudioPreset,
          id: 'codex',
          label: 'Codex',
          provider: 'codex',
          suggested_model: 'stale-preset-model',
        },
      ],
    });

    expect(options.map((option) => option.id)).toEqual(['openai/gpt-5.6-luna']);
  });

  it('surfaces a provider that reported no models instead of dropping it', () => {
    const options = buildModelOptions({
      activeCatalogProvider: '',
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'alcf',
            name: 'ALCF Metis',
            health: 'unavailable',
            failure: 'Stored Globus token could not be refreshed.',
            configuration_url: '/settings/providers?provider=alcf',
            models: [],
          }),
        ],
      },
      presets: [],
    });

    expect(options).toEqual([
      expect.objectContaining({
        kind: 'provider',
        providerId: 'alcf',
        providerName: 'ALCF Metis',
        available: false,
        availabilityDetail: 'Stored Globus token could not be refreshed.',
        configurationUrl: '/settings/providers?provider=alcf',
        health: 'unavailable',
      }),
    ]);
  });

  it('uses the name the service reports for a provider it has never heard of', () => {
    const [option] = buildModelOptions({
      activeCatalogProvider: '',
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'lab_cluster',
            name: 'Lab Cluster',
            models: [catalogModel('llama4')],
          }),
        ],
      },
      presets: [],
    });

    expect(option?.providerName).toBe('Lab Cluster');
  });

  it('reads an unavailable model in product language, not the service token', () => {
    const options = buildModelOptions({
      activeCatalogProvider: '',
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            models: [catalogModel('a', 'candidate'), catalogModel('b', 'quarantined')],
          }),
        ],
      },
      presets: [],
    });

    expect(options.map((option) => option.availabilityDetail)).toEqual([
      'Reported but not verified',
      'Unknown (quarantined)',
    ]);
  });
});

describe('modelAvailabilityLabel', () => {
  it('names what the service reported and admits when it does not know the token', () => {
    expect(modelAvailabilityLabel('available')).toBe('Available');
    expect(modelAvailabilityLabel('candidate')).toBe('Reported but not verified');
    expect(modelAvailabilityLabel('unavailable')).toBe('Unavailable');
    expect(modelAvailabilityLabel('retired')).toBe('Unknown (retired)');
    expect(modelAvailabilityLabel('')).toBe('Unknown');
  });
});
