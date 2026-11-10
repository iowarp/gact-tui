import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sessionRows = vi.hoisted(() => vi.fn());

const repository = vi.hoisted(() => ({
  connectedSources: vi.fn(),
  storageProviders: vi.fn(),
  hostStorageSettings: vi.fn(),
  sourceOperations: vi.fn(),
  sourceMappingOptions: vi.fn(),
  browseConnectedSource: vi.fn(),
  linkConnectedSource: vi.fn(),
  transferConnectedSource: vi.fn(),
  createSession: vi.fn(),
  beginSourceDraft: vi.fn(),
  attachSourceFolder: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio-one', token: 'one' } }),
}));
import { connectionScope } from '@/lib/connection-scope';
import { ConnectedSourcePicker } from './connected-source-picker';
import { sessionReads } from '@/test/session-reads';

afterEach(cleanup);

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(
    repository,
    sessionReads(() => sessionRows()),
  );
  sessionRows.mockResolvedValue([
    { id: 'session_sources', workspace_id: 'w', title: 'Source work' },
  ]);
  repository.connectedSources.mockResolvedValue([
    {
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
      linked: false,
      link_available: true,
    },
  ]);
  repository.storageProviders.mockResolvedValue({ providers: [] });
  repository.hostStorageSettings.mockResolvedValue({
    hostname: 'delta-node',
    host_label: 'Research CLIO',
    effective: { root: '/home/test' },
  });
  repository.sourceOperations.mockResolvedValue([]);
  repository.sourceMappingOptions.mockResolvedValue({
    link_access: ['read_only', 'publish_later', 'write_through'],
    write_permission: true,
    reason: 'File permissions are checked when publishing.',
  });
  repository.browseConnectedSource.mockResolvedValue({
    entries: [{ path: 'input.csv', kind: 'file', size: 12, revision: 'r1' }],
    next_offset: null,
  });
});

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

it.each([1, 2])(
  'Files opens the source list independently and offers existing-source downloads (%s sources)',
  async (count) => {
    repository.connectedSources.mockResolvedValue(
      Array.from({ length: count }, (_, i) => ({
        ...source,
        id: `s${i + 1}`,
        label: `Inputs ${i + 1}`,
      })),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const scope = connectionScope({
      endpoint: 'https://clio-one',
      token: 'one',
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
    expect(screen.getByRole('button', { name: 'Download file' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Add this folder to message' })).toBeNull();
    rendered.rerender(view(false));
    rendered.rerender(view(true));
    expect(await screen.findByText('Your sources')).toBeVisible();
    expect(client.getQueryData(['connected-storage-selection', scope, 'w'])).toBe('s1');
  },
);

it('opens a summary-selected source directly without changing the composer selection', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const key = [
    'connected-storage-selection',
    connectionScope({ endpoint: 'https://clio-one', token: 'one' }),
    'w',
  ];
  client.setQueryData(key, 'some-other-source');
  render(
    <QueryClientProvider client={client}>
      <ConnectedSourcePicker
        workspaceId="w"
        manageOnly
        initialSourceId="s1"
        open
        onOpenChange={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByRole('heading', { name: 'OPAL inputs' })).toBeVisible();
  expect(await screen.findByText('input.csv')).toBeVisible();
  expect(client.getQueryData(key)).toBe('some-other-source');
  expect(repository.beginSourceDraft).not.toHaveBeenCalled();
  client.clear();
});

describe('with no conversations in the workspace', () => {
  beforeEach(() => {
    sessionRows.mockResolvedValue([]);
    repository.createSession.mockImplementation(async (input: { title: string }) => {
      const created = { id: 'session_new', workspace_id: 'w', title: input.title };
      sessionRows.mockResolvedValue([created]);
      return created;
    });
    repository.linkConnectedSource.mockResolvedValue({ ...source, linked: true });
    repository.transferConnectedSource.mockResolvedValue({
      id: 'op1',
      state: 'queued',
      created_at: '2026-11-09',
    });
  });
  const open = async (mode: 'read_only' | 'working_copy') => {
    repository.connectedSources.mockResolvedValue([
      {
        ...source,
        mode,
        materialization: 'not_materialized',
        local_path: null,
        linked: false,
        link_available: true,
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
    await user.click(await screen.findByRole('button', { name: /^OPAL inputs/ }));
    const track = await screen.findByRole('combobox', { name: 'Track work in' });
    await waitFor(() => expect(track).toHaveTextContent('New conversation'));
    expect(track).toHaveAccessibleDescription('Named “OPAL inputs”');
    return { user, track };
  };

  it('links a folder by starting a conversation named after the source', async () => {
    const { user, track } = await open('read_only');
    await user.click(await screen.findByRole('button', { name: 'Add source to message' }));
    await waitFor(() =>
      expect(repository.linkConnectedSource).toHaveBeenCalledWith(
        'w',
        's1',
        false,
        'draft_test',
        { access: 'read_only', confirm_remote: false },
        'session_new',
      ),
    );
    expect(repository.createSession).toHaveBeenCalledOnce();
    expect(repository.createSession).toHaveBeenCalledWith({
      workspace_id: 'w',
      title: 'OPAL inputs',
    });
    expect(screen.queryByText('Choose a conversation to track this work.')).toBeNull();
    await waitFor(() => expect(track).toHaveTextContent('OPAL inputs'));
  });

  it('downloads into the started conversation and reuses it for later work', async () => {
    const { user } = await open('working_copy');
    await user.click(screen.getByRole('button', { name: 'Add source to message' }));
    await waitFor(() =>
      expect(repository.transferConnectedSource).toHaveBeenCalledWith(
        'w',
        's1',
        undefined,
        'draft_test',
        'editable',
        'session_new',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Download file' }));
    await waitFor(() =>
      expect(repository.transferConnectedSource).toHaveBeenLastCalledWith(
        'w',
        's1',
        ['input.csv'],
        'draft_test',
        'editable',
        'session_new',
      ),
    );
    expect(repository.createSession).toHaveBeenCalledOnce();
  });

  it('retries starting the conversation after a failure', async () => {
    repository.createSession.mockRejectedValueOnce(new Error('service unavailable'));
    const { user } = await open('read_only');
    await user.click(await screen.findByRole('button', { name: 'Add source to message' }));
    expect(await screen.findByText(/service unavailable/)).toBeVisible();
    expect(repository.linkConnectedSource).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Add source to message' }));
    await waitFor(() =>
      expect(repository.linkConnectedSource).toHaveBeenCalledWith(
        'w',
        's1',
        false,
        'draft_test',
        { access: 'read_only', confirm_remote: false },
        'session_new',
      ),
    );
    expect(repository.createSession).toHaveBeenCalledTimes(2);
  });
});
