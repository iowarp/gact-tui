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
  });

  it('keeps neutral GACT starter prompts for the default profile', () => {
    const brand = loadBrand(BRANDING_ROOT, 'gact');

    expect(brand.name).toBe('GACT');
    expect(brand.backendRepository).toBeNull();
    expect(brand.starterPrompts[0]?.label).toContain('data/sample.h5');
  });
});
