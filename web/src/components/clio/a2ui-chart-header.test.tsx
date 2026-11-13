import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChartHeader } from './a2ui-chart-header';

describe('a dashboard chart header', () => {
  it('never hides its actions on touch, where no hover reveals them (FN-O4)', () => {
    render(
      <ChartHeader
        actions={<button type="button">More</button>}
        dashboard
        heading="Mean temperature by time"
      />,
    );
    const actions = screen.getByRole('button', { name: 'More' }).parentElement!;
    // Only a hover-capable pointer folds them into the chart's corner (no line of their own).
    expect(actions.className).not.toMatch(/invisible/u);
    expect(actions.className).toContain('[@media(hover:hover)]:@max-[24rem]/dashboard:h-0');
    expect(actions.className).not.toMatch(/(^|\s)@max-\[24rem\]\/dashboard:h-0/u);
  });
});
