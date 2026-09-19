import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  blueprintSourceUpdates: vi.fn(),
  refreshAgentBlueprintSource: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { MarketplaceUpdatesCheck } from './settings-marketplace-updates';

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MarketplaceUpdatesCheck />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('marketplace update check', () => {
  it('checks every source and renders each typed outcome honestly, including an unrecognized reason', async () => {
    const user = userEvent.setup();
    repository.blueprintSourceUpdates.mockResolvedValue({
      sources: [
        {
          source_id: 'src_1',
          source: 'https://github.com/iowarp/clio-blueprints',
          ref: 'main',
          installed_commit: 'ea49ed17aa11',
          remote_commit: 'ea49ed17aa11',
          update_available: false,
          reason: 'up_to_date',
        },
        {
          source_id: 'src_2',
          source: '/local/blueprints',
          update_available: null,
          reason: 'path_source_not_git',
          detail: 'This source was added from a local path, not a git checkout.',
        },
      ],
      checked_at: '2026-09-18T00:00:00Z',
    });

    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Check marketplace updates' }));

    expect(repository.blueprintSourceUpdates).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('https://github.com/iowarp/clio-blueprints')).toBeVisible();
    expect(screen.getByText('Up to date')).toBeVisible();
    expect(screen.getByText('/local/blueprints')).toBeVisible();
    expect(screen.getByText('Not a git checkout')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Update' })).not.toBeInTheDocument();
  });

  it('offers Update only for a source reporting update_available, and re-checks after applying it', async () => {
    const user = userEvent.setup();
    repository.blueprintSourceUpdates.mockResolvedValueOnce({
      sources: [
        {
          source_id: 'src_3',
          source: 'https://github.com/iowarp/other-blueprints',
          ref: 'main',
          installed_commit: 'aaaa1111',
          remote_commit: 'bbbb2222',
          update_available: true,
          reason: 'update_available',
        },
      ],
      checked_at: '2026-09-18T00:00:00Z',
    });
    repository.refreshAgentBlueprintSource.mockResolvedValue({});
    repository.blueprintSourceUpdates.mockResolvedValueOnce({
      sources: [
        {
          source_id: 'src_3',
          source: 'https://github.com/iowarp/other-blueprints',
          ref: 'main',
          installed_commit: 'bbbb2222',
          remote_commit: 'bbbb2222',
          update_available: false,
          reason: 'up_to_date',
        },
      ],
      checked_at: '2026-09-18T00:05:00Z',
    });

    renderPanel();
    await user.click(screen.getByRole('button', { name: 'Check marketplace updates' }));
    expect(await screen.findByText('Update available')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(repository.refreshAgentBlueprintSource).toHaveBeenCalledWith('src_3');
    await screen.findByText('Up to date');
    expect(repository.blueprintSourceUpdates).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Update available')).not.toBeInTheDocument();
  });
});
