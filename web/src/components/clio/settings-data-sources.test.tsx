import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectionScope } from '@/lib/connection-scope';
const fixtures = vi.hoisted(() => ({
  endpoint: 'https://clio-one',
  token: 'one',
  repository: {
    workspaces: vi.fn(),
    connectedSources: vi.fn(),
    storageProviders: vi.fn(),
    signOutStorageAccount: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: fixtures.endpoint, token: fixtures.token },
  }),
}));
import { DataSourceSettings } from './settings-data-sources';
const account = {
  id: 'globus',
  name: 'Globus',
  logo: 'globus',
  authentication: 'browser',
  configured: true,
  authenticated: false,
  setup_requirement: null,
  capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
};
beforeEach(() => {
  vi.resetAllMocks();
  fixtures.endpoint = 'https://clio-one';
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [
      account,
      { ...account, id: 'local', name: 'Local folder', authentication: 'none' },
      { ...account, id: 'sftp', name: 'SSH', authentication: 'ssh_profile' },
    ],
  });
});
afterEach(cleanup);
function content(client: QueryClient) {
  return (
    <QueryClientProvider client={client}>
      <DataSourceSettings />
    </QueryClientProvider>
  );
}
it('manages accounts without querying or modifying workspace sources', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const scope = connectionScope({ endpoint: fixtures.endpoint, token: fixtures.token });
  client.setQueryData(['connected-storage-selection', scope, 'w'], 'attach-selection');
  render(content(client));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Sign in to Globus' }));
  expect(screen.getByRole('heading', { name: 'Sign in to Globus' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'All accounts' }));
  expect(screen.queryByRole('combobox', { name: 'Workspace' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Connect' })).not.toBeInTheDocument();
  expect(screen.queryByText('Local folder')).not.toBeInTheDocument();
  expect(screen.queryByText('Your sources')).not.toBeInTheDocument();
  expect(fixtures.repository.workspaces).not.toHaveBeenCalled();
  expect(fixtures.repository.connectedSources).not.toHaveBeenCalled();
  expect(client.getQueryData(['connected-storage-selection', scope, 'w'])).toBe('attach-selection');
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [{ ...account, authenticated: true }],
  });
  await client.invalidateQueries({ queryKey: ['connected-storage', scope, 'accounts'] });
  await user.click(await screen.findByRole('button', { name: 'Sign out of Globus' }));
  expect(screen.getByText(/across all workspaces/)).toBeVisible();
  fixtures.repository.signOutStorageAccount.mockResolvedValue({ authenticated: false });
  fixtures.repository.storageProviders.mockResolvedValue({ providers: [account] });
  await user.click(screen.getByRole('button', { name: 'Sign out' }));
  await waitFor(() =>
    expect(fixtures.repository.signOutStorageAccount).toHaveBeenCalledWith('globus'),
  );
  expect(await screen.findByRole('button', { name: 'Sign in to Globus' })).toBeVisible();
});
it('drops the previous private login when the CLIO connection changes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(content(client));
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Sign in to Globus' }));
  fixtures.endpoint = 'https://clio-two';
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [{ ...account, id: 'github', name: 'GitHub' }],
  });
  view.rerender(content(client));
  expect(await screen.findByRole('button', { name: 'Sign in to GitHub' })).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Sign in to Globus' })).not.toBeInTheDocument();
});
it('shows real setup limitations and retries a failed account read', async () => {
  fixtures.repository.storageProviders.mockRejectedValueOnce(new Error('Account service offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(content(client));
  const user = userEvent.setup();
  expect(await screen.findByRole('alert')).toHaveTextContent('Account service offline');
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [
      {
        ...account,
        configured: false,
        setup_requirement: 'Configure the Globus application on this CLIO.',
      },
    ],
  });
  await user.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('button', { name: 'Sign in to Globus' })).toBeDisabled();
  expect(screen.getByText('Configure the Globus application on this CLIO.')).toBeVisible();
});
