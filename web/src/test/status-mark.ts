import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect } from 'vitest';

/**
 * A column status mark is named by its state, and hovering it shows that name
 * in the shared tooltip rather than a native title. Render under a
 * TooltipProvider (renderWithTooltips).
 */
export async function expectStatusMark(name: string | RegExp, hover: string | RegExp) {
  expect(screen.getByRole('img', { name })).not.toHaveAttribute('title');
  const user = userEvent.setup();
  // The first pointer enter mounts the tooltip around the mark; the next move opens it.
  await user.hover(screen.getByRole('img', { name }));
  await user.hover(screen.getByRole('img', { name }));
  const tooltip = await screen.findByRole('tooltip');
  if (typeof hover === 'string') expect(tooltip.textContent).toBe(hover);
  else expect(tooltip.textContent).toMatch(hover);
}
