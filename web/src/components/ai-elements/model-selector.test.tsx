import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ModelSelectorLogo } from './model-selector';

afterEach(cleanup);

describe('ModelSelectorLogo', () => {
  it('renders_vendor_svg_for_known_provider: inlines the packaged vendor SVG, not a text glyph', () => {
    render(<ModelSelectorLogo provider="anthropic" />);

    const mark = screen.getByRole('img', { name: 'anthropic logo' });
    const svg = mark.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('fill', 'currentColor');
    // The Anthropic mark's own path data — proves this is the real vendor
    // SVG (web/public/provider-logos/anthropic.svg), not a fabricated glyph.
    expect(mark.innerHTML).toContain('M17.3041 3.541');
  });

  it('falls_back_to_generic_for_unknown: an unrecognized provider id renders the shared neutral placeholder', () => {
    const { unmount } = render(<ModelSelectorLogo provider="future-provider" />);
    const unknownMark = screen.getByRole('img', { name: 'future-provider logo' });
    expect(unknownMark.querySelector('svg')).not.toBeNull();
    const unknownMarkup = unknownMark.innerHTML;
    unmount();

    // Identical markup to the explicit "generic" id — the SAME neutral
    // placeholder, not a per-provider invention.
    render(<ModelSelectorLogo provider="generic" />);
    const genericMark = screen.getByRole('img', { name: 'generic logo' });
    expect(unknownMarkup).toBe(genericMark.innerHTML);
  });
});
