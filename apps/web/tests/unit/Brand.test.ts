import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadBrand } from '../../vite-plugin-brand';

const BRANDING_ROOT = resolve(__dirname, '../../../branding');

describe('brand profiles', () => {
  it('keeps neutral GACT starter prompts for the default profile', () => {
    const brand = loadBrand(BRANDING_ROOT, 'gact');

    expect(brand.name).toBe('GACT');
    expect(brand.backendRepository).toBeNull();
    expect(brand.starterPrompts[0]?.label).toContain('data/sample.h5');

    // GACT omits a `backend` block, so it resolves to the neutral connect
    // default: gact-tui makes no managed-agent assumption.
    expect(brand.backend.mode).toBe('connect');
    expect(brand.backend.sidecarName).toBe('');
    expect(brand.backend.attachPort).toBe(17800);
    expect(brand.backend.attachPortEnv).toBe('GACT_PORT');
    expect(brand.backend.attachUrlEnv).toBe('GACT_URL');
    expect(brand.backend.install).toBeNull();
  });
});
