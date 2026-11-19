import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { STORE_REFUSED } from './composer-failure';
import { PendingSurfaceNotices } from './pending-interaction-notices';

afterEach(cleanup);

it('titles a store that refuses writes for what it means, with the service sentence', () => {
  const error = new Error("CLIO's conversation store is full, so nothing new can be recorded.");
  error.name = STORE_REFUSED;
  render(<PendingSurfaceNotices error={error} />);
  expect(screen.getByText('Nothing new can be recorded')).toBeVisible();
  expect(screen.getByText(/conversation store is full/u)).toBeVisible();
  expect(screen.queryByText('Some responses could not be read')).toBeNull();
});

it('keeps the read-failure title for any other failure', () => {
  render(<PendingSurfaceNotices error={new Error('One session could not be read')} />);
  expect(screen.getByText('Some responses could not be read')).toBeVisible();
});
