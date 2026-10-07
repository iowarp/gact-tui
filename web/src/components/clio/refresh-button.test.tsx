import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { RefreshAction } from './refresh-button';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('keeps feedback until completion and prevents duplicate refreshes', async () => {
  const user = userEvent.setup();
  let complete!: () => void;
  const onRefresh = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  render(<RefreshAction label="Refresh files" onRefresh={onRefresh} />);
  await user.click(screen.getByRole('button', { name: 'Refresh files' }));
  const busy = screen.getByRole('button', { name: 'Refresh files — refreshing' });
  expect(busy).toBeDisabled();
  expect(busy).toHaveAttribute('aria-busy', 'true');
  expect(busy.querySelector('svg')).toHaveClass('animate-spin', 'motion-reduce:animate-none');
  expect(screen.getByRole('status')).toHaveTextContent('Refreshing');
  await user.click(busy);
  expect(onRefresh).toHaveBeenCalledTimes(1);
  await act(async () => complete());
  expect(screen.getByRole('button', { name: 'Refresh files' })).toBeEnabled();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('stops feedback after a failed request and allows another attempt', async () => {
  const user = userEvent.setup();
  const onRefresh = vi
    .fn()
    .mockRejectedValueOnce(new Error('Connection lost'))
    .mockResolvedValueOnce(undefined);
  render(<RefreshAction label="Refresh document" onRefresh={onRefresh} />);
  await user.click(screen.getByRole('button', { name: 'Refresh document' }));
  expect(toast.error).toHaveBeenCalledWith('Connection lost');
  expect(screen.getByRole('button', { name: 'Refresh document' })).toBeEnabled();
  await user.click(screen.getByRole('button', { name: 'Refresh document' }));
  expect(onRefresh).toHaveBeenCalledTimes(2);
});
