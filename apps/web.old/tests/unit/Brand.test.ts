import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadBrand } from '../../vite-plugin-brand';

const BRANDING_ROOT = resolve(__dirname, '../../../branding');

describe('brand profiles', () => {
  it('ships a neutral GACT default profile', () => {
    const brand = loadBrand(BRANDING_ROOT, 'gact');

    expect(brand.name).toBe('GACT');
    expect(brand.backendRepository).toBeNull();
    expect(brand.starterPrompts[0]?.label).toContain('data/sample.h5');
  });

  it('does not ship any agent-specific brand inside gact-tui', () => {
    // Embedding agents (e.g. clio-agent) provide their own brand from THEIR
    // repo via a gitignored apps/brand.config.local.json + external
    // brandingRoot — gact-tui itself carries only the neutral default.
    expect(existsSync(resolve(BRANDING_ROOT, 'clio'))).toBe(false);
  });
});
