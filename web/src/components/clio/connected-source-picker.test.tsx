import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionScope } from '@/lib/connection-scope';
import { TransportError } from '@clio/core/v3';
import { toMessagePart } from '@/lib/composer-reference-domain';

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

describe('connected source picker', () => {
  it.each([true, false])(
    'reuses a whole source from the list without a new transfer (linked=%s)',
    async (linked) => {
      fixtures.repository.connectedSources.mockResolvedValue([{ ...source, linked }]);
      const onSelect = vi.fn();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={onSelect} />
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Your sources' }));
      await user.click(screen.getByRole('button', { name: 'Add OPAL inputs to message' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
      expect(fixtures.repository.attachSourceFolder).toHaveBeenCalledWith(
        'w',
        's1',
        linked,
        '',
        'draft_test',
      );
      expect(fixtures.repository.transferConnectedSource).not.toHaveBeenCalled();
      expect(fixtures.repository.linkConnectedSource).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'references the browsed folder, not its whole source (linked=%s)',
    async (linked) => {
      fixtures.repository.connectedSources.mockResolvedValue([{ ...source, linked }]);
      fixtures.repository.browseConnectedSource.mockResolvedValue({
        entries: [{ path: 'nested', kind: 'directory' }],
        next_offset: null,
      });
      const onSelect = vi.fn();
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={onSelect} />
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Your sources' }));
      await user.click(screen.getByRole('button', { name: /^OPAL inputs/ }));
      if (!linked) await user.click(screen.getByRole('button', { name: 'Downloaded' }));
      await user.click(await screen.findByRole('button', { name: 'nested' }));
      await user.click(screen.getByRole('button', { name: 'Add this folder to message' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
      expect(fixtures.repository.attachSourceFolder).toHaveBeenCalledWith(
        'w',
        's1',
        linked,
        'nested',
        'draft_test',
      );
      expect(onSelect.mock.calls[0][0]).toMatchObject({
        label: 'OPAL inputs / nested',
        navigation: { source_path: 'nested', source_linked: String(linked) },
      });
      expect(fixtures.repository.transferConnectedSource).not.toHaveBeenCalled();
    },
  );

  it.each([1, 2])(
    'Files always opens the list with %s sources and cannot add data',
    async (count) => {
      fixtures.repository.connectedSources.mockResolvedValue(
        Array.from({ length: count }, (_, i) => ({
          ...source,
          id: `s${i + 1}`,
          label: `Inputs ${i + 1}`,
        })),
      );
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const scope = connectionScope({
        endpoint: fixtures.endpoint,
        token: fixtures.token,
      });
      client.setQueryData(['connected-storage-selection', scope, 'w'], 's1');
      const view = (open: boolean) => (
        <QueryClientProvider client={client}>
          <ConnectedSourcePicker workspaceId="w" manageOnly open={open} onOpenChange={vi.fn()} />
        </QueryClientProvider>
      );
      const rendered = render(view(true));
      const user = userEvent.setup();
      expect(await screen.findByText('Your sources')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Choose folder' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Connect' })).toBeNull();
      await user.click(screen.getByRole('button', { name: /^Inputs 1/ }));
      expect(await screen.findByRole('heading', { name: 'Inputs 1' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Download all' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Download file' })).toBeNull();
      rendered.rerender(view(false));
      rendered.rerender(view(true));
      expect(await screen.findByText('Your sources')).toBeVisible();
      expect(client.getQueryData(['connected-storage-selection', scope, 'w'])).toBe('s1');
    },
  );

  it('removing the copy clears availability despite a retained completed transfer', async () => {
    fixtures.repository.sourceOperations.mockResolvedValue([
      { id: 'op1', state: 'completed', created_at: '2026-10-04', bytes_done: 14, bytes_total: 14 },
    ]);
    fixtures.repository.sourceLifecycle.mockImplementation(async () => {
      const removed = { ...source, local_path: null, materialization: 'not_materialized' };
      fixtures.repository.connectedSources.mockResolvedValue([removed]);
      return removed;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" manageOnly open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    expect(await screen.findByText('Downloaded to workspace Files: 14 B / 14 B')).toBeVisible();
    await user.click(screen.getByText('Downloaded copy'));
    await user.click(screen.getByRole('button', { name: 'Remove workspace copy' }));
    await user.click(screen.getByRole('button', { name: 'Remove copy' }));
    expect(await screen.findByText('No downloaded copy in this workspace.')).toBeVisible();
    expect(screen.queryByText(/Downloaded to workspace Files/)).toBeNull();
    expect(screen.queryByText('Downloaded copy')).toBeNull();
    expect(fixtures.repository.sourceLifecycle).toHaveBeenCalledWith('w', 's1', 'remove-copy');
  });

  it('attaches folders as ordinary resource message parts with source identity', async () => {
    const onSelect = vi.fn();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={onSelect} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Your sources' }));
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    await user.click(screen.getByRole('button', { name: 'Add source to message' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
    expect(fixtures.repository.attachSourceFolder).toHaveBeenCalledWith(
      'w',
      's1',
      false,
      '',
      'draft_test',
    );
    const reference = onSelect.mock.calls[0][0];
    expect(reference).toMatchObject({
      label: 'OPAL inputs',
      navigation: { source_id: 's1', source_kind: 'folder' },
    });
    expect(toMessagePart(reference)).toMatchObject({
      type: 'resource_ref',
      resource_id: 'res_folder',
      resource_revision: '1',
      name: 'OPAL inputs',
    });
  });

  it('adds the folder to the message after this download completes, not from old history', async () => {
    const onSelect = vi.fn();
    const oldOperation = {
      id: 'old',
      state: 'completed',
      created_at: '2026-10-03',
      bytes_done: 14,
    };
    fixtures.repository.sourceOperations.mockResolvedValue([oldOperation]);
    fixtures.repository.transferConnectedSource.mockImplementation(async () => {
      const completed = { ...oldOperation, id: 'new', created_at: '2026-10-04' };
      fixtures.repository.sourceOperations.mockResolvedValue([oldOperation, completed]);
      return completed;
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={onSelect} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Your sources' }));
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    await screen.findByText(/Downloaded to workspace Files/);
    expect(onSelect).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
    expect(fixtures.repository.attachSourceFolder).toHaveBeenCalledWith(
      'w',
      's1',
      false,
      '',
      'draft_test',
    );
  });
  it.each([true, false])(
    'separates fsspec linking from transfer capability (download=%s)',
    async (downloads) => {
      fixtures.repository.connectedSources.mockResolvedValue([
        {
          ...source,
          provider: downloads ? 'sftp' : 'github',
          mode: 'read_only',
          label: 'Remote files',
          materialization: 'not_materialized',
          local_path: null,
          link_available: true,
          linked: false,
          download_available: downloads,
        },
      ]);
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={vi.fn()} />
        </QueryClientProvider>,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: 'Your sources' }));
      await user.click(await screen.findByText('Remote files'));
      const downloadFile = await screen.findByRole('button', { name: 'Download file' });
      if (downloads) expect(downloadFile).toBeEnabled();
      else expect(downloadFile).toBeDisabled();
      expect(screen.getByText(/Keep files at their source/)).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Link folder' }));
      await waitFor(() =>
        expect(fixtures.repository.linkConnectedSource).toHaveBeenCalledWith(
          'w',
          's1',
          false,
          'draft_test',
          { access: 'read_only', confirm_remote: false },
        ),
      );
      expect(fixtures.repository.transferConnectedSource).not.toHaveBeenCalled();
      if (downloads) {
        expect(screen.getByRole('button', { name: 'Download all' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Download file' }));
        await waitFor(() =>
          expect(fixtures.repository.transferConnectedSource).toHaveBeenCalledWith(
            'w',
            's1',
            ['input.csv'],
            'draft_test',
            'editable',
          ),
        );
      } else {
        expect(screen.queryByRole('button', { name: 'Download all' })).toBeNull();
        expect(screen.getByRole('button', { name: 'Download file' })).toBeDisabled();
      }
    },
  );
  it('offers collection authorization when Globus requires additional consent', async () => {
    const globus = {
      ...source,
      provider: 'globus',
      mode: 'read_only',
      label: 'Tutorial collection',
      local_path: null,
      materialization: 'not_materialized',
    };
    fixtures.repository.connectedSources.mockResolvedValue([globus]);
    fixtures.repository.browseConnectedSource.mockImplementation(async () => {
      fixtures.repository.connectedSources.mockResolvedValue([{ ...globus, authenticated: false }]);
      throw new TransportError('Authorize this Globus collection', 403);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    await userEvent.click(await screen.findByText('Tutorial collection', { exact: true }));
    expect(await screen.findByRole('button', { name: 'Authorize collection' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Transfer to CLIO' })).toBeNull();
  });
  it.each([
    { name: 'explicit local', local: true, location: 'Local', endpoint: 'https://clio-one' },
    { name: 'remote host', local: false, location: 'delta', endpoint: 'https://clio-one' },
    {
      name: 'direct browser localhost',
      local: true,
      location: '',
      endpoint: 'http://127.0.0.1:18825',
    },
    {
      name: 'SSH loopback tunnel',
      local: false,
      location: '',
      endpoint: 'http://127.0.0.1:64000',
      targetId: 'ssh-delta',
    },
  ])(
    'shows only the appropriate folder actions for $name',
    async ({ local, location, endpoint, targetId }) => {
      fixtures.location = location;
      fixtures.endpoint = endpoint;
      fixtures.infrastructure = targetId ? { targetId, serviceId: 'clio_agent' } : undefined;
      fixtures.repository.storageProviders.mockResolvedValue({
        providers: [
          {
            id: 'local',
            name: 'Files on this CLIO',
            authentication: 'none',
            configured: true,
            capabilities: source.capabilities,
          },
        ],
      });
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={client}>
          <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      );
      await screen.findByRole('heading', {
        name: local ? 'From this computer' : 'Upload from your computer',
      });
      await waitFor(() => expect(fixtures.repository.storageProviders).toHaveBeenCalled());
      if (local) expect(screen.queryByText('Use a folder on delta-node')).toBeNull();
      else expect(await screen.findByText('Use a folder on delta-node')).toBeVisible();
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'Choose folder' }));
      expect(
        await screen.findByText(local ? 'Use an existing folder' : 'Upload a folder'),
      ).toBeVisible();
    },
  );
  it('keeps Back, Edit, close, and discard as separate actions', async () => {
    const pending = {
      ...source,
      authenticated: false,
      provider: 'google_drive',
      label: 'Pending Drive',
      local_path: null,
      materialization: 'not_materialized',
      can_edit_location: true,
    };
    fixtures.repository.connectedSources.mockResolvedValue([pending]);
    fixtures.repository.removeConnectedSource.mockResolvedValue({ removed: true });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={onOpenChange} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Pending Drive/ }));
    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('heading', { name: 'Your sources' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Edit source' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /^Pending Drive/ }));
    await user.click(screen.getByRole('button', { name: 'Close and keep setup' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(fixtures.repository.removeConnectedSource).not.toHaveBeenCalled();
    onOpenChange.mockClear();
    await user.click(screen.getByRole('button', { name: 'Discard source and close' }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(fixtures.repository.removeConnectedSource).toHaveBeenCalledWith('w', 's1');
  });
  it('edits sign-in setup with the pencil and saves the same source identity', async () => {
    const created = {
      ...source,
      id: 'drive',
      provider: 'google_drive',
      label: 'Google Drive',
      root: 'input_data',
      authenticated: false,
      local_path: null,
      materialization: 'not_materialized',
      can_edit_location: true,
    };
    fixtures.repository.connectedSources.mockResolvedValue([]);
    fixtures.repository.storageProviders.mockResolvedValue({
      providers: [
        {
          id: 'google_drive',
          name: 'Google Drive',
          authentication: 'browser',
          configured: false,
          capabilities: source.capabilities,
        },
      ],
    });
    fixtures.repository.createConnectedSource.mockResolvedValue(created);
    fixtures.repository.updateConnectedSource.mockResolvedValue({
      ...created,
      label: 'Research inputs',
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Connect$/ }));
    await user.type(screen.getByLabelText('Google Drive folder link'), 'input_data');
    await user.click(screen.getByRole('button', { name: 'Connect folder' }));
    await screen.findByRole('button', { name: 'Log in' });
    fixtures.repository.connectedSources.mockResolvedValue([created]);
    await user.click(screen.getByRole('button', { name: 'Edit source' }));
    expect(screen.getByLabelText('Google Drive folder link')).toHaveValue('input_data');
    await user.clear(screen.getByLabelText(/Name/));
    await user.type(screen.getByLabelText(/Name/), 'Research inputs');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fixtures.repository.updateConnectedSource).toHaveBeenCalledWith(
        'w',
        'drive',
        expect.objectContaining({ label: 'Research inputs', root: 'input_data' }),
      ),
    );
    expect(fixtures.repository.createConnectedSource).toHaveBeenCalledTimes(1);
  });

  it('removes an unauthenticated source from its row without deleting copies', async () => {
    const pending = {
      ...source,
      authenticated: false,
      provider: 'google_drive',
      label: 'Pending Drive',
      local_path: null,
      materialization: 'not_materialized',
    };
    fixtures.repository.connectedSources.mockResolvedValue([pending]);
    fixtures.repository.removeConnectedSource.mockImplementation(async () => {
      fixtures.repository.connectedSources.mockResolvedValue([]);
      return { removed: true };
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    expect(await screen.findByText('Sign-in needed')).toBeVisible();
    expect(screen.queryByText('not materialized')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Manage Pending Drive' }));
    await user.click(screen.getByRole('menuitem', { name: 'Remove source' }));
    expect(screen.getByText(/Original files, downloaded copies/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove source' }));
    await waitFor(() => expect(screen.queryByText('Pending Drive')).toBeNull());
    expect(fixtures.repository.removeConnectedSource).toHaveBeenCalledWith('w', 's1');
  });
  it('lets the user enter a folder and continue even when application discovery is unconfigured', async () => {
    fixtures.repository.storageProviders.mockResolvedValue({
      providers: [
        {
          id: 'google_drive',
          name: 'Google Drive',
          authentication: 'browser',
          configured: false,
          setup_requirement: 'Application setup missing',
          capabilities: { supported_modes: ['read_only', 'working_copy'], unavailable_reasons: {} },
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
    await user.click(await screen.findByRole('button', { name: /^Connect$/ }));
    expect(screen.getByPlaceholderText('Optional name')).toBeEnabled();
    const folder = screen.getByLabelText('Google Drive folder link');
    expect(folder).toBeEnabled();
    const button = screen.getByRole('button', { name: 'Connect folder' });
    expect(button).toBeEnabled();
    await user.type(folder, 'https://drive.google.com/drive/folders/input_data');
    await user.click(button);
    await waitFor(() =>
      expect(fixtures.repository.createConnectedSource).toHaveBeenCalledWith(
        'w',
        expect.objectContaining({
          root: 'https://drive.google.com/drive/folders/input_data',
          label: 'Google Drive',
          mode: 'read_only',
        }),
      ),
    );
  });

  it('uses one attach surface for files and correctly labelled folder uploads', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onUploadFiles = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker
          workspaceId="w"
          open
          onOpenChange={vi.fn()}
          onUploadFiles={onUploadFiles}
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Choose files' }));
    expect(onUploadFiles).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Choose folder' }));
    expect(screen.getByText('No folder chosen')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Choose folder' })).toBeEnabled();
    expect(screen.queryByText(/OPAL/)).toBeNull();
  });

  it('does not attach a late result after switching credentials', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSelect = vi.fn();
    let finish: ((value: unknown) => void) | undefined;
    fixtures.repository.attachSourceFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = () => (
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={onSelect} />
      </QueryClientProvider>
    );
    const rendered = render(view());
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Your sources' }));
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    await user.click(screen.getByRole('button', { name: 'Downloaded' }));
    await user.click(await screen.findByRole('button', { name: 'Add to message' }));
    await waitFor(() => expect(finish).toBeDefined());
    fixtures.token = 'different';
    fixtures.repository.connectedSources.mockResolvedValue([]);
    rendered.rerender(view());
    finish?.({ id: 'res_old', name: 'input.csv', revision: 1, detected_mime: 'text/csv' });
    await screen.findByText('Bring your data into this workspace');
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('keeps selection during refresh and attaches source-bound resource identity', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const onSelect = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} onSelect={onSelect} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Your sources' }));
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    await user.click(screen.getByRole('button', { name: 'Download all' }));
    await waitFor(() =>
      expect(fixtures.repository.transferConnectedSource).toHaveBeenCalledWith(
        'w',
        's1',
        undefined,
        'draft_test',
        'editable',
      ),
    );
    expect(screen.getByRole('heading', { name: 'OPAL inputs' })).toBeInTheDocument();
    expect(await screen.findByText('input.csv')).toBeInTheDocument();
    fixtures.repository.attachSourceFile.mockResolvedValue({
      id: 'res_one',
      name: 'input.csv',
      revision: 1,
      detected_mime: 'text/csv',
    });
    await user.click(screen.getByRole('button', { name: 'Downloaded' }));
    await user.click(screen.getByRole('button', { name: 'Add to message' }));
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'resource',
          id: 'res_one',
          detail: 'OPAL inputs: input.csv',
          navigation: expect.objectContaining({ source_id: 's1', source_provider: 'local' }),
        }),
      ),
    );
    expect(fixtures.repository.browseConnectedSource).toHaveBeenCalledWith(
      'w',
      's1',
      expect.objectContaining({ materialized: true }),
      expect.any(AbortSignal),
    );
  });

  it.each(['google_drive', 'github'])(
    'offers a writable %s link with a propagation warning',
    async (provider) => {
      fixtures.repository.storageProviders.mockResolvedValue({
        providers: [
          {
            id: provider,
            name: provider === 'github' ? 'GitHub' : 'Google Drive',
            authentication: 'browser',
            configured: true,
            capabilities: {
              supported_modes: ['read_only', 'working_copy', 'write_enabled'],
              unavailable_reasons: {},
            },
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
      await user.click(await screen.findByRole('button', { name: /^Connect$/ }));
      expect(screen.queryByRole('radio')).toBeNull();
      expect(
        screen.getByText('Choose Download or Link and how edits are handled after connecting.'),
      ).toBeVisible();
    },
  );

  it('disables modes the provider cannot deliver and explains them on tap', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Connect$/ }));
    expect(screen.queryByRole('radio')).toBeNull();
    expect(
      screen.getByText('Choose Download or Link and how edits are handled after connecting.'),
    ).toBeVisible();
    expect(screen.queryByText(/Destination collection/)).toBeNull();
    expect(fixtures.repository.createConnectedSource).not.toHaveBeenCalled();
  });

  it.each(['endpoint', 'token'] as const)(
    'does not carry a selected source across a changed %s',
    async (field) => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      const view = () => (
        <QueryClientProvider client={client}>
          <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
        </QueryClientProvider>
      );
      const rendered = render(view());
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
      fixtures[field] = 'different';
      fixtures.repository.connectedSources.mockResolvedValue([]);
      rendered.rerender(view());
      await screen.findByText('Bring your data into this workspace');
      expect(screen.queryByRole('heading', { name: 'OPAL inputs' })).not.toBeInTheDocument();
      expect(
        client.getQueryData([
          'connected-storage-selection',
          connectionScope({ endpoint: 'https://clio-one', token: 'one' }),
          'w',
        ]),
      ).toBe('s1');
    },
  );
});
