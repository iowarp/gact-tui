import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ModelSelectorLogo } from './model-selector';

afterEach(cleanup);

describe('ModelSelectorLogo', () => {
  it('renders_vendor_svg_for_known_provider: masks with the packaged vendor SVG, not a text glyph', () => {
    render(<ModelSelectorLogo provider="anthropic" />);

    const mark = screen.getByRole('img', { name: 'anthropic logo' });
    expect(mark.querySelector('[data-provider-logo-mask]')).toHaveAttribute(
      'data-provider-logo-mask',
      '/provider-logos/anthropic.svg',
    );
  });

  it('falls_back_to_generic_for_unknown: an unrecognized provider id renders the shared neutral placeholder', () => {
    const { unmount } = render(<ModelSelectorLogo provider="future-provider" />);
    const unknownMark = screen.getByRole('img', { name: 'future-provider logo' });
    const unknownUrl = unknownMark
      .querySelector('[data-provider-logo-mask]')
      ?.getAttribute('data-provider-logo-mask');
    unmount();

    // Identical markup to the explicit "generic" id — the SAME neutral
    // placeholder, not a per-provider invention.
    render(<ModelSelectorLogo provider="generic" />);
    const genericMark = screen.getByRole('img', { name: 'generic logo' });
    expect(unknownUrl).toBe(
      genericMark
        .querySelector('[data-provider-logo-mask]')
        ?.getAttribute('data-provider-logo-mask'),
    );
  });

  it('falls_back_to_generic_for_prototype_property_names: a provider id shaped like an Object.prototype member never resolves through the prototype chain', () => {
    const { unmount } = render(<ModelSelectorLogo provider="constructor" />);
    const protoMark = screen.getByRole('img', { name: 'constructor logo' });
    const protoUrl = protoMark
      .querySelector('[data-provider-logo-mask]')
      ?.getAttribute('data-provider-logo-mask');
    unmount();

    render(<ModelSelectorLogo provider="generic" />);
    const genericMark = screen.getByRole('img', { name: 'generic logo' });
    expect(protoUrl).toBe(
      genericMark
        .querySelector('[data-provider-logo-mask]')
        ?.getAttribute('data-provider-logo-mask'),
    );
  });
});
