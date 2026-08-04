/**
 * Slice A failing-first contract — brand identity through existing surfaces
 * (P5 inventory A1–A2, docs/design/p4-conformance-gaps.md).
 *
 * A1: the composer placeholder derives from the brand profile. The prototype
 * reads "Message clio …" because the prototype IS the clio brand; a build with
 * any other profile must never say "clio". The unit profile is `gact`, so the
 * hardcoded string is red here by construction.
 *
 * A2: the rail lockup is the prototype's — per-letter wordmark spans spread
 * across the block, tagline row beneath. Structure is asserted here; geometry
 * (Inter 20/700, 156px spread, 42×42 logo) is verified by the conformance
 * audit against a real browser, which jsdom cannot do.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { brand } from '@brand';
import { Composer } from '../../src/composer/Composer';
import { Rail } from '../../src/shell/Rail';

describe('composer placeholder (A1)', () => {
  it('derives from the brand name, never a hardcoded product', () => {
    render(<Composer onSubmit={vi.fn()} />);
    expect(screen.getByRole('textbox')).toHaveAttribute(
      'placeholder',
      `Message ${brand.name.toLowerCase()} (@ to reference, / for commands)`,
    );
  });
});

describe('rail lockup (A2)', () => {
  function renderRail() {
    return render(
      <Rail groups={[]} activeSessionId={null} onSelectSession={vi.fn()} onCollapse={vi.fn()} />,
    );
  }

  it('renders the wordmark as one span per letter', () => {
    const { container } = renderRail();
    const letters = container.querySelectorAll('.shell-lockup__wordmark span');
    expect(letters).toHaveLength(brand.wordmark.length);
    expect([...letters].map((l) => l.textContent).join('')).toBe(brand.wordmark);
  });

  it('renders the tagline row beneath the wordmark', () => {
    const { container } = renderRail();
    // Compare the row's full text: an accent-bearing profile (clio) splits the
    // tagline across a link, so a single-text-node matcher is profile-naive —
    // this test failed under clio while passing under gact until it compared
    // the assembled row instead.
    const row = container.querySelector('.shell-lockup__tagline');
    if (brand.tagline) {
      expect(row?.textContent).toBe(brand.tagline);
    } else {
      expect(row).toBeNull();
    }
  });
});
