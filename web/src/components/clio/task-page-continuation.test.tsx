import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { TaskPageContinuation } from './async-task-list';

afterEach(cleanup);

it('offers continuation even after an empty page and keeps loaded work after a page failure', async () => {
  const loadMore = vi
    .fn()
    .mockRejectedValueOnce(new Error('Next page unavailable'))
    .mockResolvedValueOnce(undefined);
  render(
    <>
      <p>Previously loaded work</p>
      <TaskPageContinuation pagination={{ hasMore: true, pending: false, loadMore }} />
    </>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Load more work' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Next page unavailable');
  expect(screen.getByText('Previously loaded work')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Load more work' }));
  expect(loadMore).toHaveBeenCalledTimes(2);
});

it('disables continuation while a page is loading and removes it only at the last page', () => {
  const loadMore = vi.fn();
  const { rerender } = render(
    <TaskPageContinuation pagination={{ hasMore: true, pending: true, loadMore }} />,
  );
  expect(screen.getByRole('button', { name: 'Loading work…' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button'));
  expect(loadMore).not.toHaveBeenCalled();
  rerender(<TaskPageContinuation pagination={{ hasMore: false, pending: false, loadMore }} />);
  expect(screen.queryByRole('button')).toBeNull();
});
