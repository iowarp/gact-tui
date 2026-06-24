import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadBrand } from '../../vite-plugin-brand';

const BRANDING_ROOT = resolve(__dirname, '../../../branding');

describe('brand profiles', () => {
  it('loads CLIO-specific starter prompts from the brand file', () => {
    const brand = loadBrand(BRANDING_ROOT, 'clio');

    expect(brand.name).toBe('CLIO');
    expect(brand.backendRepository?.label).toBe('github.com/iowarp/clio-agent');
    expect(brand.starterPrompts.length).toBeGreaterThanOrEqual(4);
    expect(brand.starterPrompts.map((prompt) => prompt.eyebrow)).toContain('EarthScope');
    expect(brand.starterPrompts[0]?.label).toContain("EarthScope's GNSS network");

    // CLIO resolves to the managed clio-agent backend (also the default).
    expect(brand.backend.mode).toBe('managed');
    expect(brand.backend.sidecarName).toBe('clio-agent');
    expect(brand.backend.attachPort).toBe(17800);
    expect(brand.backend.attachPortEnv).toBe('CLIO_PORT');
    expect(brand.backend.attachUrlEnv).toBe('CLIO_GACT_URL');
    expect(brand.backend.install).not.toBeNull();
    expect(brand.backend.install?.ref).toBe('develop');
    expect(brand.backend.install?.windowsUrl).toContain('clio-agent');
    expect(brand.backend.install?.repoLabel).toBe('github.com/iowarp/clio-agent');
  });

  it('keeps neutral GACT starter prompts for the default profile', () => {
    const brand = loadBrand(BRANDING_ROOT, 'gact');

    expect(brand.name).toBe('GACT');
    expect(brand.backendRepository).toBeNull();
    expect(brand.starterPrompts[0]?.label).toContain('data/sample.h5');

    // GACT omits a `backend` block, so it resolves to the managed default
    // (clio-agent) — byte-identical to today's behavior.
    expect(brand.backend.mode).toBe('managed');
    expect(brand.backend.sidecarName).toBe('clio-agent');
    expect(brand.backend.attachPort).toBe(17800);
    expect(brand.backend.install).not.toBeNull();
  });
});
