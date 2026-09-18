import { describe, expect, it } from 'vitest';

import { providerLogoSvgs } from './provider-logo-svgs';

describe('providerLogoSvgs', () => {
  // Once inlined into the DOM (dangerouslySetInnerHTML in ModelSelectorLogo),
  // an upstream <title>/<desc> becomes real visible/tooltip text sitting
  // right next to the wrapping span's own accessible label — and can collide
  // with it (e.g. two "LM Studio" text matches in the same dialog). The
  // wrapping span's aria-label is the ONLY accessible name this markup
  // should ever carry; see web/public/provider-logos/README.md.
  it('no_registered_svg_carries_a_title_or_desc_element: every packaged mark had its upstream <title>/<desc> stripped on import', () => {
    for (const [id, svg] of Object.entries(providerLogoSvgs)) {
      expect(svg, `${id} still contains a <title> element`).not.toMatch(/<title[\s>]/u);
      expect(svg, `${id} still contains a <desc> element`).not.toMatch(/<desc[\s>]/u);
    }
  });
});
