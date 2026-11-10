import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectionScope } from '@/lib/connection-scope';

const fixtures = vi.hoisted(() => ({
  endpoint: 'https://clio-one',
  repository: {
    obsidianStatus: vi.fn(),
    installObsidian: vi.fn(),
    signInObsidian: vi.fn(),
    signOutObsidian: vi.fn(),
    obsidianVaults: vi.fn(),
    setupObsidianVault: vi.fn(),
    createConnectedSource: vi.fn(),
    knowledgeSync: vi.fn(),
    removeConnectedSource: vi.fn(),
    storageProviders: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: fixtures.endpoint, token: 'test' } }),
}));
vi.mock('./host-path-picker', () => ({
  HostPathPicker: ({ onChoose }: { onChoose: (path: string) => void }) => (
    <button type="button" onClick={() => onChoose('/host/notes')}>
      Choose folder
    </button>
  ),
}));
import { ObsidianSourceForm } from './obsidian-source-form';
import { ObsidianAccountSettings } from './obsidian-account-settings';

const ready = {
  installed: true,
  authenticated: true,
  version: '0.0.14',
  state: 'ready',
  message: '',
};
const source = {
  id: 'source-new',
  provider: 'obsidian',
  label: 'My knowledge',
  source_kind: 'knowledge',
};
beforeEach(() => {
  vi.resetAllMocks();
  fixtures.endpoint = 'https://clio-one';
  fixtures.repository.obsidianStatus.mockResolvedValue(ready);
  fixtures.repository.createConnectedSource.mockResolvedValue(source);
  fixtures.repository.obsidianVaults.mockResolvedValue({
    vaults: [{ id: 'remote-id', name: 'Research' }],
  });
  fixtures.repository.setupObsidianVault.mockResolvedValue({ root: '/managed/sync-copy' });
  fixtures.repository.storageProviders.mockResolvedValue({
    providers: [
      {
        id: 'obsidian',
        name: 'Obsidian',
        logo: 'obsidian',
        authentication: 'none',
        configured: true,
        capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
        setup_requirement: null,
      },
    ],
  });
});
afterEach(cleanup);
function mountForm() {
  const onConnected = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const content = () => (
    <QueryClientProvider client={client}>
      <ObsidianSourceForm
        workspaceId="w"
        hostLabel="DESKTOP"
        onConnected={onConnected}
        onBack={() => {}}
      />
    </QueryClientProvider>
  );
  const view = render(content());
  return { client, onConnected, view, content, user: userEvent.setup() };
}

it('creates an empty editable vault without asking for a folder, installation or account', async () => {
  const { user, onConnected } = mountForm();
  expect(screen.getByRole('radio', { name: 'Create a new vault' })).toBeChecked();
  expect(screen.getByRole('link', { name: 'About Obsidian' })).toHaveAttribute(
    'href',
    'https://obsidian.md/',
  );
  expect(screen.queryByRole('button', { name: 'Choose folder' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Create vault' }));
  await waitFor(() => expect(onConnected).toHaveBeenCalledWith(source));
  expect(fixtures.repository.createConnectedSource).toHaveBeenCalledWith(
    'w',
    expect.objectContaining({
      provider: 'obsidian',
      root: '',
      create_vault: true,
      mode: 'write_enabled',
    }),
  );
  expect(fixtures.repository.obsidianStatus).not.toHaveBeenCalled();
  expect(fixtures.repository.installObsidian).not.toHaveBeenCalled();
});

it('attaches an existing folder read only using the shared folder picker', async () => {
  const { user } = mountForm();
  await user.click(screen.getByRole('radio', { name: 'Attach an existing vault or folder' }));
  expect(screen.getByRole('button', { name: 'Connect vault' })).toBeDisabled();
  expect(screen.queryByPlaceholderText('/path/to/data')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Choose folder' }));
  await user.click(screen.getByRole('button', { name: 'Connect vault' }));
  await waitFor(() =>
    expect(fixtures.repository.createConnectedSource).toHaveBeenCalledWith(
      'w',
      expect.objectContaining({ root: '/host/notes', create_vault: false, mode: 'read_only' }),
    ),
  );
});

it('configures the selected remote vault and starts the managed client with independent edit consent', async () => {
  const { user, onConnected } = mountForm();
  await user.click(screen.getByRole('radio', { name: 'Sync from Obsidian' }));
  await screen.findByRole('option', { name: 'Research' });
  await user.selectOptions(screen.getByLabelText('Obsidian Sync vault'), 'remote-id');
  await user.type(screen.getByLabelText(/Vault encryption password/), 'vault-secret');
  await user.selectOptions(screen.getByLabelText('Sync direction'), 'bidirectional');
  expect(screen.getByRole('checkbox', { name: /create and edit notes/ })).not.toBeChecked();
  await user.click(screen.getByRole('button', { name: 'Connect vault' }));
  await waitFor(() => expect(onConnected).toHaveBeenCalledWith(source));
  expect(fixtures.repository.setupObsidianVault).toHaveBeenCalledWith('remote-id', 'vault-secret');
  expect(fixtures.repository.createConnectedSource).toHaveBeenCalledWith(
    'w',
    expect.objectContaining({
      root: '/managed/sync-copy',
      mode: 'read_only',
      configuration: { obsidian_connection: 'headless_sync', obsidian_sync_mode: 'bidirectional' },
    }),
  );
  expect(fixtures.repository.knowledgeSync).toHaveBeenCalledWith('w', 'source-new', 'start');
});

it('rolls back the source connection if sync cannot start, so retry does not accumulate sources', async () => {
  fixtures.repository.knowledgeSync.mockRejectedValue(new Error('Sync could not start'));
  const { user, onConnected } = mountForm();
  await user.click(screen.getByRole('radio', { name: 'Sync from Obsidian' }));
  await screen.findByRole('option', { name: 'Research' });
  await user.selectOptions(screen.getByLabelText('Obsidian Sync vault'), 'remote-id');
  await user.click(screen.getByRole('button', { name: 'Connect vault' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Sync could not start');
  expect(fixtures.repository.removeConnectedSource).toHaveBeenCalledWith('w', 'source-new');
  expect(onConnected).not.toHaveBeenCalled();
});

it('drops the chosen host folder when switching to a different CLIO connection', async () => {
  const { user, view, content } = mountForm();
  await user.click(screen.getByRole('radio', { name: 'Attach an existing vault or folder' }));
  await user.click(screen.getByRole('button', { name: 'Choose folder' }));
  fixtures.endpoint = 'https://clio-two';
  view.rerender(content());
  expect(screen.getByRole('radio', { name: 'Create a new vault' })).toBeChecked();
  expect(screen.queryByText('/host/notes')).not.toBeInTheDocument();
});

it('offers managed installation and keeps account setup separate from workspace sources', async () => {
  const missing = {
    ...ready,
    installed: false,
    authenticated: false,
    version: '',
    state: 'missing',
  };
  fixtures.repository.obsidianStatus.mockResolvedValue(missing);
  fixtures.repository.installObsidian.mockResolvedValue({
    ...missing,
    state: 'installing',
    message: 'Installing the official client…',
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ObsidianAccountSettings />
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Install Sync client' }));
  expect(await screen.findByRole('button', { name: 'Installing client…' })).toBeDisabled();
  expect(fixtures.repository.installObsidian).toHaveBeenCalledTimes(1);
  fixtures.repository.obsidianStatus.mockResolvedValue({ ...ready, authenticated: false });
  await client.invalidateQueries({
    queryKey: ['obsidian-account', connectionScope({ endpoint: fixtures.endpoint, token: 'test' })],
  });
  await screen.findByLabelText('Account password');
  await user.type(screen.getByLabelText('Obsidian account email'), 'person@example.com');
  await user.type(screen.getByLabelText('Account password'), 'private-password');
  fixtures.endpoint = 'https://clio-two';
  view.rerender(
    <QueryClientProvider client={client}>
      <ObsidianAccountSettings />
    </QueryClientProvider>,
  );
  expect(await screen.findByLabelText('Account password')).toHaveValue('');
  expect(fixtures.repository.createConnectedSource).not.toHaveBeenCalled();
});

it('starts Connect on existing notes with read-only access and no account requirement', async () => {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ObsidianSourceForm
        workspaceId="w"
        hostLabel="DESKTOP"
        initialChoice="existing"
        onConnected={vi.fn()}
        onBack={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('radio', { name: 'Attach an existing vault or folder' })).toBeChecked();
  expect(screen.getByRole('checkbox', { name: /create and edit notes/ })).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Connect vault' })).toBeDisabled();
  expect(fixtures.repository.obsidianStatus).not.toHaveBeenCalled();
});
