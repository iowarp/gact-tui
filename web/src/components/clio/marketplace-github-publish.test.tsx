import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportError } from '@clio/core/v3';

const repository = vi.hoisted(() => ({
  localPublishStatus: vi.fn(),
  publishLocalMarketplace: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'http://127.0.0.1' } }),
}));
vi.mock('./connected-source-auth', () => ({
  ConnectedAccountSignIn: ({ provider }: { provider: string }) => (
    <button type="button">{`Sign in with ${provider}`}</button>
  ),
}));

import { GitHubPublish } from './marketplace-github-publish';

const signedIn = {
  github: {
    signed_in: true,
    account_name: 'lab-member',
    account_url: 'https://github.com/apps/clio/installations/new',
  },
  last: null,
  empty: false,
  changed_since: false,
};

const result = {
  repository: 'lab/plugins-backup',
  url: 'https://github.com/lab/plugins-backup',
  branch: 'main',
  commit: 'abc123',
  published_at: '2026-11-16T22:00:00Z',
  private: true,
  up_to_date: false,
  written: ['plugins/run-board/plugin.json', 'plugins/run-board/server.py'],
  removed: ['plugins/old/plugin.json'],
  commit_url: 'https://github.com/lab/plugins-backup/commit/abc123',
};

function renderPublish(hasLocalItems = true) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GitHubPublish hasLocalItems={hasLocalItems} />
    </QueryClientProvider>,
  );
}

describe('Publish the private marketplace to GitHub', () => {
  beforeEach(() => {
    repository.localPublishStatus.mockResolvedValue(signedIn);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('asks a person who is not signed in to sign in to GitHub first', async () => {
    repository.localPublishStatus.mockResolvedValue({
      ...signedIn,
      github: { ...signedIn.github, signed_in: false, account_name: '' },
    });
    renderPublish();
    expect(await screen.findByRole('button', { name: 'Sign in with github' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('publishes to the named repository and says how another host uses it', async () => {
    const user = userEvent.setup();
    repository.publishLocalMarketplace.mockResolvedValue(result);
    renderPublish();
    expect(await screen.findByText(/Signed in to GitHub as lab-member/u)).toBeVisible();
    await user.type(screen.getByLabelText('Repository'), 'lab/plugins-backup');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(repository.publishLocalMarketplace).toHaveBeenCalledWith('lab/plugins-backup', false);
    expect(await screen.findByText('Published 3 changes to lab/plugins-backup.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'View the commit on GitHub' })).toHaveAttribute(
      'href',
      result.commit_url,
    );
    expect(
      screen.getByText(/add https:\/\/github\.com\/lab\/plugins-backup from Marketplaces/u),
    ).toBeVisible();
  });

  it('starts from the last repository and says when nothing changed since', async () => {
    repository.localPublishStatus.mockResolvedValue({
      ...signedIn,
      last: { ...result, up_to_date: undefined },
      changed_since: true,
    });
    renderPublish();
    expect(await screen.findByLabelText('Repository')).toHaveValue('lab/plugins-backup');
    expect(
      screen.getByText('Changed since you last published to lab/plugins-backup.'),
    ).toBeVisible();
  });

  it('publishes to a public repository only when the person confirms it', async () => {
    const user = userEvent.setup();
    repository.publishLocalMarketplace
      .mockRejectedValueOnce(
        new TransportError(
          'lab/open is public: anyone could read these plugins and agents.',
          409,
          'repository_public',
        ),
      )
      .mockResolvedValueOnce({ ...result, repository: 'lab/open', private: false });
    renderPublish();
    await user.type(await screen.findByLabelText('Repository'), 'lab/open');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('anyone could read');
    await user.click(screen.getByRole('button', { name: 'Publish to the public repository' }));
    expect(repository.publishLocalMarketplace).toHaveBeenLastCalledWith('lab/open', true);
    expect(await screen.findByText('Published 3 changes to lab/open.')).toBeVisible();
  });

  it('links to the GitHub app when it cannot reach the repository', async () => {
    const user = userEvent.setup();
    repository.publishLocalMarketplace.mockRejectedValue(
      new TransportError('Cannot reach lab/hidden.', 404, 'repository_not_reachable', {
        account_url: signedIn.github.account_url,
      }),
    );
    renderPublish();
    await user.type(await screen.findByLabelText('Repository'), 'lab/hidden');
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(
      await screen.findByRole('link', { name: /GitHub app access to the repository/u }),
    ).toHaveAttribute('href', signedIn.github.account_url);
  });

  it('cannot publish an empty collection', async () => {
    renderPublish(false);
    await userEvent.setup().type(await screen.findByLabelText('Repository'), 'lab/x');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });
});
