import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MessageMarkButton } from './message-mark-button';

afterEach(cleanup);

it('waits for server acknowledgement without claiming an unsaved mark', async () => {
  const user = userEvent.setup();
  let resolve!: () => void;
  const onMark = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  const { rerender } = render(<MessageMarkButton marked={false} onMark={onMark} />, {
    wrapper: TooltipProvider,
  });
  await user.click(screen.getByRole('button', { name: 'Mark message' }));
  expect(onMark).toHaveBeenCalledWith(true);
  expect(screen.getByRole('button')).toBeDisabled();
  expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
  resolve();
  rerender(<MessageMarkButton marked onMark={onMark} />);
  expect(await screen.findByRole('button', { name: 'Unmark message' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('leaves the saved state intact after a failed save and supports keyboard use', async () => {
  const user = userEvent.setup();
  const onMark = vi.fn().mockRejectedValue(new Error('Offline'));
  render(<MessageMarkButton marked onMark={onMark} />, { wrapper: TooltipProvider });
  await user.tab();
  await user.keyboard('{Enter}');
  expect(onMark).toHaveBeenCalledWith(false);
  expect(screen.getByRole('button', { name: 'Unmark message' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('button')).toBeEnabled();
});
