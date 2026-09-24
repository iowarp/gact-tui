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
    reasoning: {
      supported: true,
      parameter: 'reasoning_effort',
      levels: ['low', 'medium', 'high'],
    },
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
              reasoning: {
                supported: true,
                parameter: 'reasoning_effort',
                levels: ['low', 'medium', 'high'],
              },
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

  it('turns an unauthenticated ALCF catalog failure into a sign-in action', () => {
    const options = buildModelOptions({
      activeCatalogProvider: '',
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'argonne_metis',
            name: 'ALCF Metis',
            health: 'unavailable',
            failure: "model discovery failed: Client error '401 Unauthorized'",
            models: [],
          }),
        ],
      },
      presets: [
        {
          ...lmStudioPreset,
          id: 'argonne_metis',
          label: 'ALCF Metis',
          provider: 'argonne',
          is_authenticated: false,
          status: 'auth_required',
          status_message: 'stored Globus token could not be refreshed; authenticate ALCF',
        },
      ],
    });

    expect(options[0]?.availabilityDetail).toBe('Sign in to your ALCF account again.');
  });

  it('does not leak an ALCF 401 when the preset still reports a stale authenticated state', () => {
    const options = buildModelOptions({
      activeCatalogProvider: '',
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'argonne_metis',
            name: 'ALCF Metis',
            health: 'unavailable',
            failure:
              "model discovery failed: Client error '401 Unauthorized' for url 'https://example.invalid/models'",
            models: [],
          }),
        ],
      },
      presets: [
        {
          ...lmStudioPreset,
          id: 'argonne_metis',
          label: 'ALCF Metis',
          provider: 'argonne',
          is_authenticated: true,
          status: 'ready',
        },
      ],
    });

    expect(options[0]?.availabilityDetail).toBe('Sign in to your ALCF account again.');
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

  it('keeps CLI aliases usable when the connected agent reports the runtime ready', () => {
    const options = buildModelOptions({
      activeCatalogProvider: 'claude_code',
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'claude_code',
            name: 'Claude Code (subscription)',
            kind: 'claude_code',
            endpoint: 'claude-code://sdk',
            health: 'ready',
            models: [catalogModel('sonnet', 'candidate')],
          }),
        ],
      },
      presets: [
        {
          ...lmStudioPreset,
          id: 'claude_code',
          label: 'Claude Code (subscription)',
          provider: 'claude_code',
          is_authenticated: true,
          status: 'ready',
        },
      ],
    });

    expect(options).toEqual([
      expect.objectContaining({
        providerId: 'claude_code',
        id: 'sonnet',
        available: true,
        availabilityDetail: 'Reported but not verified',
      }),
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

describe('buildModelOptions over a real last-good catalog', () => {
  it('keeps ALCF models visible and selectable after a restart, dated', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { providerCatalogSchema } = await import('@clio/core/v3');
    // Captured from the real clio-agent routes; see the core decoder test.
    const payloads = JSON.parse(
      readFileSync(
        resolve(process.cwd(), '../packages/core/src/v3/fixtures/server-provider-payloads.json'),
        'utf8',
      ),
    ) as { provider_catalog_last_good: unknown };
    const providerCatalog = providerCatalogSchema.parse(payloads.provider_catalog_last_good);

    const metis = buildModelOptions({
      activeCatalogProvider: '',
      providerCatalog,
      presets: [],
    }).filter((option) => option.providerId === 'argonne_metis');

    expect(metis.map((option) => option.id)).toContain('openai/gpt-oss-120b');
    for (const option of metis) {
      // Prior evidence, not a failure: selectable, with its date shown.
      expect(option.available).toBe(true);
      expect(option.availabilityDetail).toMatch(/^Last confirmed /u);
    }
  });

  it('dates a last-good model by its latest confirmation, not its first discovery', () => {
    const provider = catalogProvider({
      id: 'argonne_metis',
      name: 'ALCF Metis',
      freshness: {
        generated_at: '2026-09-01T10:00:00Z',
        source: 'last_good',
        staleness: { reason: 'last_good_catalog_served', confirmed_at: '2026-09-22T18:30:00Z' },
      },
      models: [catalogModel('gpt-oss-120b', 'candidate')],
    });

    const [option] = buildModelOptions({
      activeCatalogProvider: '',
      providerCatalog: { authoritative: 'live_handshake', providers: [provider] },
      presets: [],
    });

    expect(option?.availabilityDetail).toContain(new Date('2026-09-22T18:30:00Z').toLocaleString());
    expect(option?.availabilityDetail).not.toContain(
      new Date('2026-09-01T10:00:00Z').toLocaleString(),
    );
  });
});
