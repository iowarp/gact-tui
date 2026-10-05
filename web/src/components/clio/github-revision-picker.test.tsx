import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({ githubRevisions: vi.fn(), createConnectedSource: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio-one', token: 'test' } }),
}));
import { ConnectedSourceForm } from './connected-source-form';

beforeEach(() => {
  vi.resetAllMocks();
  fixtures.githubRevisions.mockImplementation(async (_url, kind, page) => ({
    repository: 'owner/repo',
    default_branch: 'main',
    next_page: kind === 'branch' && page === 1 ? 2 : null,
    revisions:
      kind === 'branch'
        ? [
            {
              value: page === 1 ? 'main' : 'feature/data',
              label: page === 1 ? 'main' : 'feature/data',
              sha: 'a'.repeat(40),
            },
          ]
        : kind === 'tag'
          ? [{ value: 'v1.0', label: 'v1.0', sha: 'b'.repeat(40) }]
          : [{ value: 'c'.repeat(40), label: 'Fix data', sha: 'c'.repeat(40) }],
  }));
  fixtures.createConnectedSource.mockResolvedValue({ id: 'new-source' });
});
afterEach(cleanup);

function Example() {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ConnectedSourceForm
        workspaceId="w"
        hostLabel="CLIO"
        onBack={vi.fn()}
        onConnected={vi.fn()}
        provider={{
          id: 'github',
          name: 'GitHub',
          authentication: 'browser',
          configured: true,
          logo: 'github',
          setup_requirement: null,
          capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
        }}
      />
    </QueryClientProvider>
  );
}

it('starts disabled, loads the default branch and publishes the selected branch to setup', async () => {
  render(<Example />);
  const user = userEvent.setup();
  expect(screen.getByRole('combobox', { name: 'Revision' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Branch' })).toBeDisabled();
  expect(fixtures.githubRevisions).not.toHaveBeenCalled();
  await user.type(
    screen.getByRole('textbox', { name: 'Repository or folder link' }),
    'https://github.com/owner/repo',
  );
  await screen.findByRole('option', { name: 'Default: main' });
  expect(fixtures.githubRevisions).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Load more branches' }));
  await user.selectOptions(
    screen.getByRole('combobox', { name: 'Branch' }),
    await screen.findByRole('option', { name: 'feature/data' }),
  );
  await user.click(screen.getByRole('button', { name: 'Connect folder' }));
  expect(fixtures.createConnectedSource).toHaveBeenCalledWith(
    'w',
    expect.objectContaining({ configuration: { github_ref: 'feature/data' } }),
  );
});

it('loads tags and commits on demand and keeps an explicit commit ID valid', async () => {
  render(<Example />);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Repository or folder link' }),
    'https://github.com/owner/repo',
  );
  await screen.findByRole('option', { name: 'Default: main' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Revision' }), 'tag');
  await screen.findByRole('option', { name: 'v1.0' });
  expect(screen.getByRole('button', { name: 'Connect folder' })).toBeDisabled();
  await user.selectOptions(screen.getByRole('combobox', { name: 'Tag' }), 'v1.0');
  await user.click(screen.getByRole('button', { name: 'Connect folder' }));
  expect(fixtures.createConnectedSource).toHaveBeenLastCalledWith(
    'w',
    expect.objectContaining({ configuration: { github_ref: 'refs/tags/v1.0' } }),
  );
  await user.selectOptions(screen.getByRole('combobox', { name: 'Revision' }), 'commit');
  await screen.findByRole('option', { name: 'ccccccc — Fix data' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Commit' }), '__manual__');
  await user.type(screen.getByRole('textbox', { name: 'Commit ID' }), 'invalid');
  expect(screen.getByRole('button', { name: 'Connect folder' })).toBeDisabled();
  await user.clear(screen.getByRole('textbox', { name: 'Commit ID' }));
  await user.type(screen.getByRole('textbox', { name: 'Commit ID' }), 'deadbeef');
  await user.click(screen.getByRole('button', { name: 'Connect folder' }));
  expect(fixtures.createConnectedSource).toHaveBeenLastCalledWith(
    'w',
    expect.objectContaining({ configuration: { github_ref: 'deadbeef' } }),
  );
});

it('clears the previous selection and disables choices while changing repositories', async () => {
  render(<Example />);
  const user = userEvent.setup();
  const url = screen.getByRole('textbox', { name: 'Repository or folder link' });
  await user.type(url, 'https://github.com/owner/repo');
  await screen.findByRole('option', { name: 'Default: main' });
  await user.selectOptions(screen.getByRole('combobox', { name: 'Branch' }), 'main');
  await user.clear(url);
  expect(screen.getByRole('combobox', { name: 'Branch' })).toBeDisabled();
  expect(screen.queryByRole('option', { name: 'main' })).not.toBeInTheDocument();
  await user.type(url, 'https://github.com/owner/another');
  await screen.findByRole('option', { name: 'Default: main' });
  await user.click(screen.getByRole('button', { name: 'Connect folder' }));
  expect(fixtures.createConnectedSource).toHaveBeenLastCalledWith(
    'w',
    expect.objectContaining({
      root: 'https://github.com/owner/another',
      configuration: { github_ref: '' },
    }),
  );
});

it('shows an access error without retrying repeatedly or enabling a stale revision', async () => {
  fixtures.githubRevisions.mockRejectedValue(new Error('Sign in with access to this repository.'));
  render(<Example />);
  const user = userEvent.setup();
  await user.type(
    screen.getByRole('textbox', { name: 'Repository or folder link' }),
    'https://github.com/owner/private',
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('Sign in with access');
  expect(screen.getByRole('combobox', { name: 'Branch' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Connect folder' })).toBeDisabled();
  expect(fixtures.githubRevisions).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await waitFor(() => expect(fixtures.githubRevisions).toHaveBeenCalledTimes(2));
});
