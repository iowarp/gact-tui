import type { ProviderCatalog } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildModelOptions } from './model-options';

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
});
