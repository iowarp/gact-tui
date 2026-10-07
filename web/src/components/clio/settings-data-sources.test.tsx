import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionScope } from '@/lib/connection-scope';

const fixtures = vi.hoisted(() => ({
  endpoint: 'https://clio-one',
  token: 'one',
  repository: {
    workspaces: vi.fn(),
    connectedSources: vi.fn(),
    storageProviders: vi.fn(),
    hostStorageSettings: vi.fn(),
    signOutStorageAccount: vi.fn(),
    sourceOperations: vi.fn(),
    sourceMappingOptions: vi.fn(),
    browseConnectedSource: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: fixtures.endpoint, token: fixtures.token },
  }),
}));
import { DataSourceSettings } from './settings-data-sources';

const source = {
  id: 's1',
  label: 'OPAL inputs',
  provider: 'local',
  root: '/input',
  mode: 'working_copy',
  owner: { clio_id: 'one', host_id: 'local' },
  connected: true,
  authenticated: true,
  materialization: 'ready',
  local_path: '/workspace/connected-data/s1',
  revision: 'r1',
  configuration: {},
  capabilities: { supported_modes: ['read_only', 'working_copy'], unavailable_reasons: {} },
  can_edit_location: false,
  download_available: true,
};
beforeEach(() => {
  vi.resetAllMocks();
  fixtures.endpoint = 'https://clio-one';
  fixtures.repository.workspaces.mockResolvedValue([
    { id: 'w', name: 'first', display_name: 'First workspace' },
    { id: 'w2', name: 'second', display_name: 'Second workspace' },
  ]);
  fixtures.repository.connectedSources.mockResolvedValue([source]);
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [
      {
        id: 'globus',
        name: 'Globus',
        authentication: 'browser',
        configured: true,
        capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
      },
    ],
  });
  fixtures.repository.hostStorageSettings.mockResolvedValue({
    hostname: 'delta-node',
    effective: { root: '/input' },
  });
  fixtures.repository.sourceOperations.mockResolvedValue([]);
  fixtures.repository.sourceMappingOptions.mockResolvedValue({
    link_access: ['read_only', 'publish_later', 'write_through'],
    write_permission: true,
  });
  fixtures.repository.browseConnectedSource.mockResolvedValue({ entries: [], next_offset: null });
});
afterEach(cleanup);

describe('data sources in Settings', () => {
  it('keeps the local folder provider available on a local CLIO', async () => {
    fixtures.endpoint = 'http://127.0.0.1:8787';
    fixtures.repository.storageProviders.mockResolvedValue({
      providers: [
        {
          id: 'local',
          name: 'Local folder',
          authentication: 'none',
          configured: true,
          capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DataSourceSettings />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Use a folder on delta-node')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Choose files' })).not.toBeInTheDocument();
  });
  it('does not treat an empty source list as an empty workspace', async () => {
    fixtures.repository.connectedSources.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DataSourceSettings />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('No saved sources in this workspace')).toBeVisible();
    expect(
      screen.getByText('Workspace files stay available. Connect a source for additional data.'),
    ).toBeVisible();
    expect(screen.queryByText('Bring your data into this workspace')).not.toBeInTheDocument();
  });
  it('reuses private account sign-in without requiring a workspace', async () => {
    fixtures.repository.workspaces.mockResolvedValue([]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DataSourceSettings />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Sign in to Globus' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    expect(fixtures.repository.connectedSources).not.toHaveBeenCalled();
    expect(screen.queryByText('Loading sources…')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in to Globus' }));
    expect(screen.getByRole('heading', { name: 'Sign in to Globus' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
  });

  it('shares account sign-out and keeps source selection separate from Attach', async () => {
    fixtures.repository.storageProviders.mockResolvedValue({
      providers: [
        {
          id: 'github',
          name: 'GitHub',
          authentication: 'browser',
          configured: true,
          authenticated: true,
          capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
        },
      ],
    });
    fixtures.repository.signOutStorageAccount.mockResolvedValue({ authenticated: false });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = connectionScope({ endpoint: fixtures.endpoint, token: fixtures.token });
    client.setQueryData(['connected-storage-selection', scope, 'w'], 'attach-selection');
    render(
      <QueryClientProvider client={client}>
        <DataSourceSettings initialWorkspaceId="w" />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign out of GitHub' }));
    expect(screen.getByText(/across all workspaces/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(fixtures.repository.signOutStorageAccount).toHaveBeenCalledWith('github'),
    );
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    expect(await screen.findByRole('heading', { name: 'OPAL inputs' })).toBeVisible();
    expect(screen.queryByRole('button', { name: /Add .*to message/ })).not.toBeInTheDocument();
    expect(client.getQueryData(['connected-storage-selection', scope, 'w'])).toBe(
      'attach-selection',
    );
  });

  it('clears source details when switching the selected workspace', async () => {
    fixtures.repository.connectedSources.mockImplementation(async (wid: string) =>
      wid === 'w' ? [source] : [{ ...source, id: 's2', label: 'Second inputs' }],
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <DataSourceSettings initialWorkspaceId="w" />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    expect(await screen.findByRole('heading', { name: 'OPAL inputs' })).toBeVisible();
    await user.click(screen.getByRole('combobox', { name: 'Workspace' }));
    await user.click(await screen.findByRole('option', { name: 'Second workspace' }));
    expect(await screen.findByRole('button', { name: /^Second inputs/ })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'OPAL inputs' })).not.toBeInTheDocument();
    expect(fixtures.repository.connectedSources).toHaveBeenCalledWith(
      'w2',
      expect.any(AbortSignal),
    );
  });
});
