import type { LanguageModelPreset } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { buildModelOptions } from './model-options';

const codexPreset: LanguageModelPreset = {
  id: 'codex',
  label: 'Codex',
  provider: 'codex',
  requires_api_key: false,
  is_authenticated: true,
  supports_live_catalog: true,
  supports_vision: true,
};

describe('buildModelOptions', () => {
  it('uses the live catalog while retaining an unlisted active model', () => {
    const options = buildModelOptions({
      activeCatalogProvider: 'codex',
      activeProvider: 'codex',
      activeModel: 'gpt-5.6-luna',
      catalogModels: [{ id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' }],
      presets: [codexPreset],
    });

    expect(options).toEqual([
      expect.objectContaining({ providerId: 'codex', id: 'gpt-5.6-luna' }),
      expect.objectContaining({ providerId: 'codex', id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' }),
    ]);
  });
});
