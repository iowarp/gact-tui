import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  endpoint: 'https://clio-one',
  token: 'one',
  location: '',
  infrastructure: undefined as { targetId: string; serviceId: 'clio_agent' } | undefined,
  openLogin: vi.fn(),
  cancelLogin: vi.fn(),
  repository: {
    connectedSources: vi.fn(),
    storageProviders: vi.fn(),
    signOutStorageAccount: vi.fn(),
    startStorageAccountSignIn: vi.fn(),
    completeStorageAccountSignIn: vi.fn(),
    hostStorageSettings: vi.fn(),
    sourceOperations: vi.fn(),
    sourceMappingOptions: vi.fn(),
    browseConnectedSource: vi.fn(),
    transferConnectedSource: vi.fn(),
    beginSourceDraft: vi.fn(),
    finishSourceDraft: vi.fn(),
    linkConnectedSource: vi.fn(),
    attachSourceFile: vi.fn(),
    attachSourceFolder: vi.fn(),
    sourceLifecycle: vi.fn(),
    createConnectedSource: vi.fn(),
    updateConnectedSource: vi.fn(),
    removeConnectedSource: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/tauri/external-url', () => ({
  prepareExternalUrl: () => ({ open: fixtures.openLogin, cancel: fixtures.cancelLogin }),
  openExternalUrl: vi.fn(),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: {
      endpoint: fixtures.endpoint,
      token: fixtures.token,
      location: fixtures.location,
      infrastructure: fixtures.infrastructure,
    },
  }),
}));
import { ConnectedSourcePicker } from './connected-source-picker';

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
  fixtures.token = 'one';
  fixtures.location = '';
  fixtures.infrastructure = undefined;
  fixtures.repository.connectedSources.mockResolvedValue([source]);
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [
      {
        id: 'globus',
        name: 'Globus',
        authentication: 'browser',
        configured: true,
        setup_requirement: null,
        capabilities: {
          supported_modes: ['read_only'],
          unavailable_reasons: {
            working_copy: 'This collection cannot conditionally update files.',
            write_enabled: 'A transfer is not a writable folder.',
          },
        },
      },
    ],
  });
  fixtures.repository.hostStorageSettings.mockResolvedValue({
    hostname: 'delta-node',
    host_label: 'Research CLIO',
    effective: { root: '/home/test' },
  });
  fixtures.repository.sourceOperations.mockResolvedValue([]);
  fixtures.repository.sourceMappingOptions.mockResolvedValue({
    link_access: ['read_only', 'publish_later', 'write_through'],
    write_permission: true,
    reason: 'File permissions are checked when publishing.',
  });
  fixtures.repository.beginSourceDraft.mockResolvedValue({ id: 'draft_test' });
  fixtures.repository.finishSourceDraft.mockResolvedValue({ finished: true });
  fixtures.repository.attachSourceFolder.mockResolvedValue({
    id: 'res_folder',
    name: 'folder-index.json',
    revision: 1,
    detected_mime: 'application/json',
  });
  fixtures.repository.createConnectedSource.mockResolvedValue({
    ...source,
    id: 'drive',
    provider: 'google_drive',
    label: 'Google Drive',
    root: 'input_data',
    authenticated: false,
    local_path: null,
    materialization: 'not_materialized',
    can_edit_location: true,
  });
  fixtures.repository.browseConnectedSource.mockResolvedValue({
    entries: [{ path: 'input.csv', kind: 'file', size: 12, revision: 'r1' }],
    next_offset: null,
  });
});
afterEach(cleanup);

describe('connected provider accounts', () => {
  it.each([
    ['google_drive', 'Google Drive'],
    ['globus', 'Globus'],
    ['github', 'GitHub'],
  ])('offers independent sign-in and explains private access for %s', async (id, name) => {
    fixtures.repository.connectedSources.mockResolvedValue([]);
    fixtures.repository.storageProviders.mockResolvedValue({
      providers: [
        {
          id,
          name,
          authentication: 'browser',
          configured: true,
          authenticated: false,
          capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
        },
      ],
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    const signIn = await screen.findByRole('button', { name: `Sign in to ${name}` });
    await user.hover(signIn);
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Sign in to access private data.');
    expect(fixtures.repository.startStorageAccountSignIn).not.toHaveBeenCalled();
    await user.click(signIn);
    expect(screen.getByRole('heading', { name: `Sign in to ${name}` })).toBeVisible();
    expect(
      screen.getByRole('button', { name: id === 'github' ? 'Sign in with GitHub' : 'Log in' }),
    ).toBeVisible();
    expect(fixtures.repository.createConnectedSource).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('button', { name: 'Connect' })).toBeVisible();
  });

  it('completes independent account sign-in and refreshes provider status', async () => {
    fixtures.repository.connectedSources.mockResolvedValue([]);
    const provider = {
      id: 'globus',
      name: 'Globus',
      authentication: 'browser',
      configured: true,
      authenticated: false,
      capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
    };
    fixtures.repository.storageProviders.mockResolvedValue({ providers: [provider] });
    fixtures.repository.startStorageAccountSignIn.mockResolvedValue({
      flow_id: 'account-flow',
      authorization_url: 'https://auth.globus.org/authorize?state=test',
    });
    fixtures.repository.completeStorageAccountSignIn.mockImplementation(async () => {
      fixtures.repository.storageProviders.mockResolvedValue({
        providers: [{ ...provider, authenticated: true }],
      });
      return { authenticated: true };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign in to Globus' }));
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.type(
      await screen.findByLabelText('Authorization code or return URL'),
      'fixture-code',
    );
    await user.click(screen.getByRole('button', { name: 'Complete sign in' }));
    expect(await screen.findByText('Signed in')).toBeVisible();
    expect(fixtures.repository.startStorageAccountSignIn).toHaveBeenCalledWith('globus', undefined);
    expect(fixtures.repository.completeStorageAccountSignIn).toHaveBeenCalledWith(
      'globus',
      'account-flow',
      'fixture-code',
    );
    expect(fixtures.repository.createConnectedSource).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Sign out of Globus' })).toBeVisible();
  });

  it.each([false, true])(
    'handles public Drive access without guessing privacy (setup failure=%s)',
    async (setupFailure) => {
      if (setupFailure)
        fixtures.repository.browseConnectedSource.mockRejectedValue(
          new Error('Public Google Drive access is not set up on this CLIO.'),
        );
      fixtures.repository.connectedSources.mockResolvedValue([
        {
          ...source,
          provider: 'google_drive',
          label: 'Public data',
          authenticated: false,
          access_without_signin: true,
          local_path: null,
          materialization: 'not_materialized',
          mode: 'read_only',
          link_available: true,
          download_available: false,
        },
      ]);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /^Public data/ }));
      if (setupFailure) {
        expect(
          await screen.findByText('Public Google Drive access is not set up on this CLIO.'),
        ).toBeVisible();
        expect(screen.getByRole('button', { name: 'Log in' })).toBeVisible();
        expect(fixtures.repository.startStorageAccountSignIn).not.toHaveBeenCalled();
      } else {
        expect(await screen.findByText('input.csv')).toBeVisible();
        expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
      }
      expect(screen.getByRole('button', { name: 'Link folder' })).toBeEnabled();
    },
  );

  it('shows the saved account in an empty workspace and separates account sign-out', async () => {
    fixtures.repository.connectedSources.mockResolvedValue([]);
    const provider = {
      id: 'globus',
      name: 'Globus',
      authentication: 'browser',
      configured: true,
      authenticated: true,
      capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
    };
    fixtures.repository.storageProviders.mockResolvedValue({ providers: [provider] });
    fixtures.repository.signOutStorageAccount.mockImplementation(async () => {
      fixtures.repository.storageProviders.mockResolvedValue({
        providers: [{ ...provider, authenticated: false }],
      });
      return { signed_out: true };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="brand-new-workspace" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Signed in')).toBeVisible();
    expect(screen.queryByText('Browser sign in')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign out of Globus' }));
    expect(screen.getByText(/across all workspaces on this CLIO/)).toBeVisible();
    expect(fixtures.repository.signOutStorageAccount).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() =>
      expect(fixtures.repository.signOutStorageAccount).toHaveBeenCalledWith('globus'),
    );
    expect(await screen.findByText('Browser sign in')).toBeVisible();
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument();
  });

  it('shows collection consent instead of another login when the account is already signed in', async () => {
    fixtures.repository.connectedSources.mockResolvedValue([
      {
        ...source,
        provider: 'globus',
        label: 'Research collection',
        authenticated: false,
        account_authenticated: true,
        local_path: null,
        materialization: 'not_materialized',
      },
    ]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Research collection/ }));
    expect(await screen.findByRole('button', { name: 'Authorize collection' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Log in' })).not.toBeInTheDocument();
  });
});
