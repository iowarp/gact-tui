/**
 * Slice A failing-first contract — the Lockup component (P5 inventory A2).
 *
 * Prop-driven so the accent-link behaviour is testable regardless of which
 * profile the unit build compiled in (the gact profile carries no
 * taglineAccent, so this cannot be exercised through Rail).
 *
 * Prototype structure (measured 2026-08-03, audit-proto.json):
 *   [logo link 42×42 (homeUrl) → img | markGlyph fallback]
 *   [text block: wordmark link (homeUrl) with one span per letter,
 *    tagline row: plain text + accent substring as its own link]
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Lockup } from '../../src/shell/Lockup';

const CLIO_LIKE = {
  wordmark: 'CLIO',
  tagline: 'by the Gnosis Research Center',
  taglineAccent: 'Gnosis Research Center',
  homeUrl: 'https://iowarp.ai',
  taglineAccentUrl: 'https://grc.iit.edu',
  markGlyph: 'C',
  logoImage: '/assets/brand-logo.png',
};

describe('Lockup', () => {
  it('spreads the wordmark one span per letter inside the home link', () => {
    render(<Lockup brand={CLIO_LIKE} />);
    const wordmark = screen.getByRole('link', { name: 'CLIO' });
    expect(wordmark).toHaveAttribute('href', 'https://iowarp.ai');
    const letters = wordmark.querySelectorAll('span');
    expect(letters).toHaveLength(4);
    expect([...letters].map((l) => l.textContent).join('')).toBe('CLIO');
  });

  it('renders the accent substring of the tagline as its own link', () => {
    render(<Lockup brand={CLIO_LIKE} />);
    const accent = screen.getByRole('link', { name: 'Gnosis Research Center' });
    expect(accent).toHaveAttribute('href', 'https://grc.iit.edu');
    expect(screen.getByText(/by the/)).toBeInTheDocument();
  });

  it('prefers the logo image, with the glyph as fallback', () => {
    const { container, rerender } = render(<Lockup brand={CLIO_LIKE} />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/brand-logo.png');
    rerender(<Lockup brand={{ ...CLIO_LIKE, logoImage: null }} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('degrades to non-link structure when no homeUrl exists', () => {
    render(<Lockup brand={{ ...CLIO_LIKE, homeUrl: null, taglineAccentUrl: null }} />);
    expect(screen.queryByRole('link')).toBeNull();
    // The letters still spread; the tagline still renders.
    expect(screen.getByText('L')).toBeInTheDocument();
    expect(screen.getByText(/by the/)).toBeInTheDocument();
  });

  it('omits the tagline row entirely for a profile without one', () => {
    const { container } = render(<Lockup brand={{ ...CLIO_LIKE, tagline: '', taglineAccent: '' }} />);
    // Absence is stated by structure, not an empty styled row.
    expect(container.querySelector('.shell-lockup__tagline')).toBeNull();
  });
});
