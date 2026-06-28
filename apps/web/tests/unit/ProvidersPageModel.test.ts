import type { ProviderDef } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  filterProviders,
  providerLmInput,
} from '../../src/routes/discovery/ProvidersPageModel.js';

const providers = [
  {
    id: 'argonne',
    name: 'Argonne Sophia',
    description: 'ALCF-hosted OpenAI-compatible endpoint',
    default_model: 'openai/gpt-oss-120b',
    api_base: 'https://sophia/v1',
  },
  {
    id: 'ollama',
    name: 'Ollama',
    description: 'Local model runtime',
    default_model: 'granite3.1-dense:8b',
  },
  {
    id: 'minimal',
    name: 'Minimal Provider',
  },
] as unknown as ProviderDef[];
const argonne = providers[0]!;
const ollama = providers[1]!;
const minimal = providers[2]!;

describe('ProvidersPageModel', () => {
  it('returns the original provider list for an empty query', () => {
    expect(filterProviders(providers, '   ')).toBe(providers);
  });

  it('matches providers by id', () => {
    expect(filterProviders(providers, 'oll')).toEqual([ollama]);
  });

  it('matches providers by name case-insensitively', () => {
    expect(filterProviders(providers, 'SOPHIA')).toEqual([argonne]);
  });

  it('matches providers by description', () => {
    expect(filterProviders(providers, 'local')).toEqual([ollama]);
  });

  it('builds the LM selection payload from provider defaults', () => {
    expect(providerLmInput(argonne)).toEqual({
      provider: 'argonne',
      api_base: 'https://sophia/v1',
      model: 'openai/gpt-oss-120b',
    });
  });

  it('uses stable fallbacks when optional provider fields are missing', () => {
    expect(providerLmInput(minimal)).toEqual({
      provider: 'minimal',
      api_base: '',
      model: 'unknown',
    });
  });
});
