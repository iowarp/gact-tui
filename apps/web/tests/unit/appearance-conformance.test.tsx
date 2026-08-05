/**
 * Appearance -- Prose font (gact-tui p5 settings PASS 2, audit correction).
 *
 * The audit caught the app rendering the ProseFont union KEYS as button
 * labels ('inter', 'source', ...) instead of the prototype's full display
 * names ('Inter', 'Source Sans 3', ...). Locks the fix so it cannot regress
 * back to key-as-label.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppearancePage } from '../../src/settings/AppearancePage';
import { PROSE_FONT_LABELS, PROSE_STACKS, type ProseFont } from '../../src/theme/theme';

describe('Appearance -- prose font row', () => {
  it('renders the full display name for every font, never the raw union key', () => {
    render(<AppearancePage />);
    for (const id of Object.keys(PROSE_STACKS) as ProseFont[]) {
      // The raw key ('source', 'atkinson', ...) must not appear as visible
      // button text -- only the display label ('Source Sans 3', ...).
      expect(screen.queryByRole('button', { name: id })).toBeNull();
      expect(screen.getByRole('button', { name: PROSE_FONT_LABELS[id] })).toBeInTheDocument();
    }
  });

  it('previews each font button in its own face, matching the prototype apFonts row', () => {
    render(<AppearancePage />);
    const inter = screen.getByRole('button', { name: PROSE_FONT_LABELS.inter });
    const literata = screen.getByRole('button', { name: PROSE_FONT_LABELS.literata });
    expect(inter.style.fontFamily).toContain('Inter');
    expect(literata.style.fontFamily).toContain('Literata');
  });
});
