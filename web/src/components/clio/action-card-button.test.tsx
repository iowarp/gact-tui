import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { ActionCardButton } from './action-card-button';

it('keeps an unavailable evidence explanation accessible by keyboard and tap', async () => {
  const user = userEvent.setup();
  render(
    <ActionCardButton
      action={{
        id: 'inspect',
        label: 'Inspect evidence',
        enabled: false,
        behavior: { kind: 'inspect_attention', reason: 'The capture changed since review.' },
      }}
      onAction={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Inspect evidence' })).toBeDisabled();
  await user.tab();
  expect(screen.getByRole('button', { name: 'About Inspect evidence' })).toHaveFocus();
  await user.click(screen.getByRole('button', { name: 'About Inspect evidence' }));
  expect(await screen.findByRole('tooltip')).toHaveTextContent('The capture changed since review.');
});

it('disables an unknown future action even if its source marks it enabled', () => {
  render(
    <ActionCardButton
      action={{ id: 'future', label: 'Future action', enabled: true, behavior: { kind: 'future' } }}
      onAction={vi.fn()}
    />,
  );
  expect(screen.getByRole('button', { name: 'Future action' })).toBeDisabled();
});

