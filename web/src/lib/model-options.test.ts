import type { LanguageModelPreset, ProviderCatalog, ProviderCatalogEntry } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildModelOptions, matchesConfiguredModel, modelAvailabilityLabel } from './model-options';

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
  it('marks a provider the service is probing right now as checking, over its cached health', () => {
    const [option] = buildModelOptions({
      activeCatalogProvider: 'codex',
      presets: [],
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [catalogProvider({ checking: true, health: 'unavailable', failure: 'unreachable' })],
      },
    });

    expect(option?.health).toBe('checking');
  });

  it('reports a provider that only needs a key as needing setup, never as failed', () => {
    const [option] = buildModelOptions({
      activeCatalogProvider: 'codex',
      presets: [
        {
          id: 'openrouter',
          label: 'OpenRouter',
          provider: 'openai',
          suggested_model: '',
          requires_api_key: true,
          is_authenticated: false,
          status: 'missing_key',
          status_message: 'missing OPENROUTER_API_KEY',
          supports_live_catalog: true,
          supports_vision: false,
        },
      ],
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'openrouter',
            name: 'OpenRouter',
            health: 'unavailable',
            failure: 'no API key provided',
          }),
        ],
      },
    });

    expect(option).toMatchObject({
      health: 'needs_setup',
      availabilityDetail: 'Add your OpenRouter API key.',
    });
  });

  it('a rejected key reads as rejected, never as "sign in"', () => {
    const [option] = buildModelOptions({
      activeCatalogProvider: 'codex',
      presets: [],
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'openrouter',
            name: 'OpenRouter',
            health: 'unavailable',
            failure: 'api_key_rejected: the provider refused the API key (HTTP 401)',
          }),
        ],
      },
    });

    expect(option?.availabilityDetail).toBe('Your OpenRouter API key was rejected.');
    // A refused key is a failure (red), never "needs setup" (grey) or ready.
    expect(option?.health).toBe('unavailable');
    expect(option?.available).toBe(false);
  });

  it('never shows a raw reason code as a provider or model detail', () => {
    const options = buildModelOptions({
      activeCatalogProvider: 'codex',
      presets: [],
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          catalogProvider({
            id: 'argonne_sophia',
            name: 'ALCF Sophia',
            failure: 'argonne_reauthentication_required: Globus high-assurance timeout',
          }),
          catalogProvider({
            models: [catalogModel('gpt-5.6-luna', 'unavailable', 'model_not_entitled: not on this plan')],
          }),
        ],
      },
    });

    expect(options.map((option) => option.availabilityDetail)).toEqual([
      'Your ALCF session needs to be verified again. Sign in again to continue.',
      'Not on this plan',
    ]);
    // Never repeated as a row subtitle: the reason shows once, in the strip.
    expect(options[1]?.description).toBeUndefined();
  });

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

  it('threads a multi-transport provider entry\'s transports onto every one of its options', () => {
    const providerCatalog: ProviderCatalog = {
      authoritative: 'live_handshake',
      providers: [
        {
          id: 'codex',
          name: 'Codex',
          kind: 'codex',
          endpoint: 'local://codex-sdk',
          configuration_url: '/settings/providers/codex',
          connectivity: 'reachable',
          auth: 'ready',
          health: 'ready',
          freshness: { generated_at: '2026-08-31T12:00:00Z', source: 'live' },
          failure: '',
          transports: [
            { id: 'sdk', label: 'Codex (local)', health: 'ready', reason: '' },
            {
              id: 'direct',
              label: 'Direct',
              health: 'unavailable',
              reason: 'Codex sign-in is required',
              auth: { method: 'subscription' },
            },
          ],
          models: [
            {
              provider_id: 'codex',
              provider_kind: 'codex',
              endpoint: 'local://codex-sdk',
              deployment: '',
              model_id: 'gpt-5.6-luna',
              revision: '',
              modalities: ['text'],
              reasoning: { supported: false, parameter: '', levels: [] },
              native_tool_calling: true,
              availability: 'available',
              evidence: {
                source: 'live',
                generated_at: '2026-08-31T12:00:00Z',
                live: true,
                context_source: 'provider',
              },
              failure: '',
              transport: 'sdk',
            },
          ],
        },
      ],
    };

    const [option] = buildModelOptions({
      activeCatalogProvider: 'codex',
      providerCatalog,
      presets: [],
    });

    expect(option?.transport).toBe('sdk');
    expect(option?.transports).toEqual(providerCatalog.providers[0]?.transports);
  });

  it('never reports transports for a single-transport provider', () => {
    const providerCatalog: ProviderCatalog = {
      authoritative: 'live_handshake',
      providers: [
        {
          id: 'claude_code',
          name: 'Claude Code',
          kind: 'claude_code',
          endpoint: 'claude-code://sdk',
          configuration_url: '/settings/providers/claude_code',
          connectivity: 'reachable',
          auth: 'ready',
          health: 'ready',
          freshness: { generated_at: '2026-08-31T12:00:00Z', source: 'live' },
          failure: '',
          models: [
            {
              provider_id: 'claude_code',
              provider_kind: 'claude_code',
              endpoint: 'claude-code://sdk',
              deployment: '',
              model_id: 'claude-sonnet-5',
              revision: '',
              modalities: ['text'],
              reasoning: { supported: false, parameter: '', levels: [] },
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

    const [option] = buildModelOptions({
      activeCatalogProvider: 'claude_code',
      providerCatalog,
      presets: [],
    });

    expect(option?.transports).toBeUndefined();
    expect(option?.transport).toBeUndefined();
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

  it('does not add a reasoning-less placeholder for an alias-configured active model', () => {
    // claude_code configures the alias "sonnet"; the catalog row is the full
    // id "claude-sonnet-5" carrying its own reasoning levels + aliases. An
    // id-only comparison never finds it and unshifts a bare placeholder with
    // no reasoning, which is exactly what hid the composer's selector (#1436).
    const provider = catalogProvider({
      id: 'claude_code',
      name: 'Claude Code',
      kind: 'claude_code',
      models: [{ ...catalogModel('claude-sonnet-5'), aliases: ['sonnet'] }],
    });

    const options = buildModelOptions({
      activeCatalogProvider: '',
      activeModel: 'sonnet',
      activeProvider: 'claude_code',
      providerCatalog: { authoritative: 'live_handshake', providers: [provider] },
      presets: [],
    });

    expect(options).toHaveLength(1);
    expect(options[0]?.id).toBe('claude-sonnet-5');
    expect(options[0]?.reasoning?.levels).toEqual(['low', 'medium', 'high']);
  });
});

describe('matchesConfiguredModel', () => {
  it('matches by the option/row id directly', () => {
    expect(matchesConfiguredModel({ id: 'claude-sonnet-5' }, 'claude-sonnet-5')).toBe(true);
  });

  it('matches by a reported CLI alias', () => {
    expect(
      matchesConfiguredModel({ id: 'claude-sonnet-5', aliases: ['sonnet'] }, 'sonnet'),
    ).toBe(true);
    expect(
      matchesConfiguredModel({ id: 'claude-sonnet-5', aliases: ['sonnet'] }, 'haiku'),
    ).toBe(false);
  });

  it('matches by the service-resolved id when neither id nor alias matches', () => {
    expect(
      matchesConfiguredModel({ id: 'claude-sonnet-5' }, 'sonnet', 'claude-sonnet-5'),
    ).toBe(true);
  });

  it('never matches an empty/undefined configured model', () => {
    expect(matchesConfiguredModel({ id: 'claude-sonnet-5' }, undefined)).toBe(false);
    expect(matchesConfiguredModel({ id: 'claude-sonnet-5' }, '')).toBe(false);
  });
});

describe('provider identity resolves by id, never by shared kind (#1418)', () => {
  /** The real catalog: nine presets share the wire kind "openai". */
  function ninePresetsSharingTheOpenaiKind(): LanguageModelPreset[] {
    const rows: Array<[id: string, label: string]> = [
      ['bedrock', 'Amazon Bedrock'],
      ['azure_openai', 'Azure OpenAI'],
      ['gemini', 'Google Gemini'],
      ['vertex_ai', 'Google Vertex AI'],
      ['llama_cpp', 'llama.cpp server'],
      ['nvidia_nim', 'NVIDIA NIM'],
      ['openai', 'OpenAI / ChatGPT'],
      ['openrouter', 'OpenRouter'],
      ['vllm', 'vLLM'],
    ];
    return rows
      .map(([id, label]) => ({
        id,
        label,
        provider: 'openai',
        requires_api_key: false,
        // Only the LITERAL "openai" preset is authenticated -- every other
        // same-kind sibling (including bedrock, sorted first) is not, so a
        // wrong (kind-based) match is visible in the resulting availability.
        is_authenticated: id === 'openai',
        supports_live_catalog: true,
        supports_vision: false,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }

  it('the active-model fallback resolves the bare kind "openai" to ITS OWN preset, not the first same-kind preset by sort order', () => {
    const presets = ninePresetsSharingTheOpenaiKind();
    // Sanity check on the fixture itself: bedrock really does sort first,
    // matching the real system's picker order (gact/routes/providers.py
    // sorts presets by label) -- this is the exact ordering a kind-based
    // fallback silently resolved to instead of the literal "openai" preset.
    expect(presets[0]!.id).toBe('bedrock');

    // Simulates a caller that still passes the bare KIND as `activeProvider`
    // (what use-workspace-data.ts used to read off `modelConfiguration.data
    // ?.provider` before its own #1418 fix) with no existing catalog/preset
    // option already covering it, so the active-model fallback in
    // buildModelOptions resolves identity on its own.
    const options = buildModelOptions({
      activeCatalogProvider: '',
      activeProvider: 'openai',
      activeModel: 'gpt-4o-mini',
      presets,
    });

    expect(options).toHaveLength(1);
    // The literal "openai" preset IS authenticated. Before the fix, the
    // kind-based fallback matched "bedrock" (sorted first, NOT
    // authenticated) instead, and this option read as needing sign-in.
    expect(options[0]!.available).toBe(true);
    expect(options[0]!.availabilityDetail).toBeUndefined();
  });

  it('a preset row is not hidden by an unrelated same-kind provider already listed live', () => {
    const presets = ninePresetsSharingTheOpenaiKind();
    const options = buildModelOptions({
      activeCatalogProvider: '',
      presets,
      // llama_cpp's own catalog entry -- present so its preset row would
      // actually render if not wrongly filtered out.
      catalogModelsByProvider: {
        llama_cpp: [{ id: 'qwen3-4b-instruct-gguf', name: 'Qwen3 4B Instruct' }],
      },
      providerCatalog: {
        authoritative: 'live_handshake',
        providers: [
          {
            // The LITERAL "openai" preset reporting live -- before the fix,
            // `!liveProviderIds.has(preset.provider)` treated this as EVERY
            // "openai"-kind preset (bedrock, llama_cpp, ...) already being
            // covered, dropping their preset rows entirely.
            id: 'openai',
            name: 'OpenAI / ChatGPT',
            kind: 'openai',
            endpoint: 'https://api.openai.com/v1',
            configuration_url: '/settings/providers?provider=openai',
            connectivity: 'reachable',
            auth: 'ready',
            health: 'ready',
            freshness: { generated_at: '2026-09-24T00:00:00Z', source: 'live' },
            failure: '',
            models: [],
          },
        ],
      },
    });

    const providerIds = new Set(options.map((option) => option.providerId));
    expect(providerIds.has('llama_cpp')).toBe(true);
  });
});
