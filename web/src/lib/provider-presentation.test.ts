import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { providerLogoId, providerLogoIds } from './provider-presentation';

const publicLogosDir = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'public',
  'provider-logos',
);

function availableLogoIds(): Set<string> {
  return new Set(
    readdirSync(publicLogosDir)
      .filter((file) => file.endsWith('.svg'))
      .map((file) => file.slice(0, -'.svg'.length)),
  );
}

describe('providerLogoId', () => {
  it.each([
    ['bedrock', 'amazon-bedrock'],
    ['azure_openai', 'azure'],
    ['gemini', 'google'],
    ['vertex_ai', 'google'],
    ['codex', 'openai'],
    ['claude_code', 'anthropic'],
    ['lm_studio', 'lmstudio'],
    // llama.cpp has no official mark to license — neutral, not a fabricated
    // glyph, and no longer aliased to ollama's real one.
    ['llama_cpp', 'generic'],
    ['ollama', 'ollama'],
    ['nvidia_nim', 'nvidia'],
    ['openrouter', 'openrouter'],
    ['vllm', 'vllm'],
    // Argonne/ALCF's mark is not open-licensed — neutral, not the unrelated
    // OpenAI mark this used to resolve to.
    ['argonne_metis', 'generic'],
    ['argonne_sophia', 'generic'],
    ['argonne_local_vllm', 'generic'],
  ])('maps %s to packaged artwork %s', (provider, expected) => {
    expect(providerLogoId(provider)).toBe(expected);
  });

  it('every_logo_id_has_a_file: every id this map resolves to ships packaged artwork', () => {
    const files = availableLogoIds();

    for (const target of Object.values(providerLogoIds)) {
      expect(files.has(target), `${target}.svg is missing from web/public/provider-logos/`).toBe(
        true,
      );
    }

    // Ids that resolve to artwork of their OWN name via providerLogoId's
    // identity fallback (no entry needed in providerLogoIds) — every vendor
    // mark this workspace ships under its provider id.
    const selfMappedIds = [
      'openai',
      'anthropic',
      'mistral',
      'groq',
      'xai',
      'deepseek',
      'huggingface',
      'ollama',
      'lmstudio',
      'vllm',
      'nvidia',
      'openrouter',
      'generic',
    ];
    for (const id of selfMappedIds) {
      expect(providerLogoId(id)).toBe(id);
      expect(files.has(id), `${id}.svg is missing from web/public/provider-logos/`).toBe(true);
    }
  });
});
