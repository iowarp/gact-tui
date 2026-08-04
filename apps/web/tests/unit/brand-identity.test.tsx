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
    const letters = container.querySelectorAll('.shell-rail__wordmark span');
    expect(letters).toHaveLength(brand.wordmark.length);
    expect([...letters].map((l) => l.textContent).join('')).toBe(brand.wordmark);
  });

  it('renders the tagline row beneath the wordmark', () => {
    renderRail();
    // The gact profile has a tagline; a profile without one may omit the row,
    // but with one present it must render.
    expect(screen.getByText(new RegExp(brand.tagline.slice(0, 20)))).toBeInTheDocument();
  });
});
