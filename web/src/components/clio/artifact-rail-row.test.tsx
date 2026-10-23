import type { Artifact } from '@clio/core/v3';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ read: vi.fn(), download: vi.fn(), error: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ readArtifactBytesFor: mocks.read }),
}));
vi.mock('./surface-export', () => ({ downloadBytes: mocks.download }));
vi.mock('sonner', () => ({ toast: { error: mocks.error } }));

import { ArtifactRailRow } from './artifact-rail-row';

const artifact: Artifact = {
  id: 'report',
  session_id: 'session',
  name: 'observations.csv',
  media_type: 'text/csv',
  uri: 'artifact://observations',
};

afterEach(cleanup);
beforeEach(() => vi.resetAllMocks());

it('opens details from the name and downloads the actual artifact bytes separately', async () => {
  const bytes = new Uint8Array([97, 44, 98]);
  mocks.read.mockResolvedValue(bytes);
  const onOpen = vi.fn();
  render(<ArtifactRailRow artifact={artifact} onOpen={onOpen} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Open observations.csv' }));
  expect(onOpen).toHaveBeenCalledOnce();
  expect(mocks.read).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Download observations.csv' }));
  await waitFor(() =>
    expect(mocks.download).toHaveBeenCalledWith(bytes, 'text/csv', 'observations.csv'),
  );
  expect(mocks.read).toHaveBeenCalledWith(artifact);
});

it('disables duplicate downloads while the artifact request is pending', async () => {
  let finish!: (bytes: Uint8Array) => void;
  mocks.read.mockReturnValue(
    new Promise<Uint8Array>((resolve) => {
      finish = resolve;
    }),
  );
  render(<ArtifactRailRow artifact={artifact} />);
  const user = userEvent.setup();
  const download = screen.getByRole('button', { name: 'Download observations.csv' });
  await user.click(download);
  expect(download).toBeDisabled();
  await user.click(download);
  expect(mocks.read).toHaveBeenCalledTimes(1);
  finish(new Uint8Array([97]));
  await waitFor(() => expect(download).toBeEnabled());
});

it('shows a failed read and leaves download available for retry', async () => {
  mocks.read.mockRejectedValue(new Error('Artifact is unavailable'));
  render(<ArtifactRailRow artifact={artifact} />);
  const download = screen.getByRole('button', { name: 'Download observations.csv' });
  await userEvent.click(download);
  await waitFor(() =>
    expect(mocks.error).toHaveBeenCalledWith('Could not download artifact', {
      description: 'Artifact is unavailable',
    }),
  );
  expect(download).toBeEnabled();
  expect(mocks.download).not.toHaveBeenCalled();
});
