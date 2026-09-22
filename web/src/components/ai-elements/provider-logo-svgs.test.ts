import { describe, expect, it } from 'vitest';

import { providerLogoUrls } from './provider-logo-svgs';

describe('providerLogoUrls', () => {
  it('maps every registered mark to the same-origin packaged SVG directory', () => {
    for (const [id, url] of Object.entries(providerLogoUrls)) {
      expect(url).toBe(`/provider-logos/${id}.svg`);
    }
  });
});
