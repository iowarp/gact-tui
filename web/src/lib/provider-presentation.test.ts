import { describe, expect, it } from 'vitest';

import { providerLogoId } from './provider-presentation';

describe('providerLogoId', () => {
  it.each([
    ['bedrock', 'amazon-bedrock'],
    ['azure_openai', 'azure'],
    ['gemini', 'google'],
    ['vertex_ai', 'google'],
    ['llama_cpp', 'llama'],
    ['nvidia_nim', 'nvidia'],
    ['openrouter', 'openrouter'],
    ['vllm', 'generic'],
  ])('maps %s to packaged artwork %s', (provider, expected) => {
    expect(providerLogoId(provider)).toBe(expected);
  });
});
