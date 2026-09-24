import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { providerLogoUrls } from '../components/ai-elements/provider-logo-svgs';
import { providerDisplayName, providerLogoId, providerLogoIds } from './provider-presentation';

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
    ['llama_cpp', 'llama-cpp'],
    ['ollama', 'ollama'],
    ['nvidia_nim', 'nvidia'],
    ['openrouter', 'openrouter'],
    ['vllm', 'vllm'],
    // Argonne/ALCF's mark is not open-licensed — neutral, not the unrelated
    // OpenAI mark this used to resolve to.
    ['argonne_metis', 'argonne'],
    ['argonne_sophia', 'argonne'],
    ['argonne_local_vllm', 'argonne'],
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

  // The filesystem check above proves the FILE exists; it does not prove
  // provider-logo-svgs.ts actually imports and registers it — a file added
  // to web/public/provider-logos/ without a matching import there would pass
  // that check yet still render nothing (ModelSelectorLogo falls through to
  // the generic mark silently). These two close that gap directly on the
  // runtime registry.
  it('registry_covers_every_alias_target: every id providerLogoIds resolves to is registered in providerLogoUrls', () => {
    for (const target of Object.values(providerLogoIds)) {
      expect(
        Object.hasOwn(providerLogoUrls, target),
        `${target} is missing a providerLogoUrls entry in provider-logo-svgs.ts`,
      ).toBe(true);
    }
  });

  it('registry_covers_every_packaged_file: every packaged provider-logos/*.svg file is registered in providerLogoUrls', () => {
    for (const id of availableLogoIds()) {
      expect(
        Object.hasOwn(providerLogoUrls, id),
        `${id}.svg ships in web/public/provider-logos/ but has no providerLogoUrls entry`,
      ).toBe(true);
    }
  });
});

describe('providerDisplayName', () => {
  it('uses the service label as the one display name', () => {
    expect(
      providerDisplayName({
        id: 'argonne_metis',
        label: 'ALCF Metis',
        provider: 'argonne',
        requires_api_key: false,
        is_authenticated: true,
        supports_live_catalog: true,
        supports_vision: false,
      }),
    ).toBe('ALCF Metis');
  });

  it('names a bare id only when no service data is at hand', () => {
    expect(providerDisplayName(undefined, 'claude_code')).toBe('Claude Code');
    expect(providerDisplayName(undefined, 'Some Service')).toBe('Some Service');
    expect(providerDisplayName(undefined)).toBe('Provider');
  });
});
