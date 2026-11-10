import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ConnectedSourcePicker } from './connected-source-picker';

const fixture = vi.hoisted(() => ({
  repository: {
    connectedSources: vi.fn(),
    storageProviders: vi.fn(),
    hostStorageSettings: vi.fn(),
    searchNdp: vi.fn(),
    attachNdp: vi.fn(),
    sourceOperations: vi.fn(),
    sourceMappingOptions: vi.fn(),
    browseConnectedSource: vi.fn(),
    beginSourceDraft: vi.fn(),
    linkConnectedSource: vi.fn(),
    attachSourceFolder: vi.fn(),
    transferConnectedSource: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixture.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio.test', token: '' } }),
}));
const source = {
  id: 'source-ndp',
  label: 'Sea observations',
  provider: 'ndp',
  root: 'sea',
  mode: 'read_only',
  owner: { clio_id: 'clio', host_id: 'local' },
  connected: true,
  authenticated: true,
  configuration: {},
  linked: false,
  link_available: true,
  link_access: 'read_only',
  download_available: true,
  download_access: 'editable',
  local_path: null,
  capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
};
beforeEach(() => {
  vi.resetAllMocks();
  let connected = false;
  fixture.repository.connectedSources.mockImplementation(async () => (connected ? [source] : []));
  fixture.repository.attachNdp.mockImplementation(async () => {
    connected = true;
    return source;
  });
  fixture.repository.storageProviders.mockResolvedValue({
    providers: [
      {
        id: 'ndp',
        name: 'National Data Platform',
        logo: 'ndp',
        authentication: 'browser',
        configured: true,
        authenticated: true,
        setup_requirement: null,
        capabilities: source.capabilities,
      },
    ],
  });
  fixture.repository.hostStorageSettings.mockResolvedValue({
    hostname: 'test-host',
    effective: { root: '/workspace' },
  });
  fixture.repository.searchNdp.mockResolvedValue({
    datasets: [
      {
        id: 'sea',
        name: 'sea',
        title: 'Sea observations',
        description: '',
        endpoint_id: 'ocean',
        endpoint_name: 'Ocean',
        access: null,
        resources: [
          {
            id: 'r',
            path: 'stations.csv',
            name: 'stations.csv',
            size: 10,
            format: 'CSV',
            revision: 'r1',
          },
        ],
      },
    ],
    warnings: [],
  });
  fixture.repository.sourceOperations.mockResolvedValue([]);
  fixture.repository.sourceMappingOptions.mockResolvedValue({
    link_access: ['read_only'],
    write_permission: false,
    reason: 'NDP originals cannot be edited.',
  });
  fixture.repository.browseConnectedSource.mockResolvedValue({
    entries: [{ path: 'stations.csv', kind: 'file', size: 10, revision: 'r1' }],
    next_offset: null,
  });
  fixture.repository.beginSourceDraft.mockResolvedValue({ id: 'draft' });
  fixture.repository.linkConnectedSource.mockResolvedValue({ ...source, linked: true });
  fixture.repository.attachSourceFolder.mockResolvedValue({
    id: 'resource',
    detected_mime: 'application/json',
    revision: 1,
  });
  fixture.repository.transferConnectedSource.mockResolvedValue({ id: 'operation' });
});
afterEach(cleanup);
it.each(['link', 'download'])(
  'reviews the ordinary Download/Link choice before the %s action',
  async (choice) => {
    const onSelect = vi.fn();
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <ConnectedSourcePicker
          workspaceId="w"
          sessionId="session_ndp"
          open
          initialProviderId="ndp"
          onOpenChange={vi.fn()}
          onSelect={onSelect}
        />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    const dataset = await screen.findByRole('button', { name: /Sea observations/ });
    expect(dataset).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('checkbox', { name: /stations.csv/ })).not.toBeInTheDocument();
    await user.click(dataset);
    await screen.findByRole('checkbox', { name: /stations.csv/ });
    await user.click(screen.getByRole('checkbox', { name: /stations.csv/ }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(
      await screen.findByRole('heading', { name: 'How do you want to use these files?' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download selected files' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Link selected files' })).toBeVisible();
    expect(fixture.repository.linkConnectedSource).not.toHaveBeenCalled();
    expect(fixture.repository.transferConnectedSource).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText(/Nothing is downloaded/)).not.toBeInTheDocument();
    if (choice === 'link') {
      await user.click(screen.getByRole('button', { name: 'Link selected files' }));
      await waitFor(() => expect(onSelect).toHaveBeenCalledOnce());
      expect(fixture.repository.linkConnectedSource).toHaveBeenCalledWith(
        'w',
        'source-ndp',
        false,
        'draft',
        { access: 'read_only', confirm_remote: false },
        'session_ndp',
      );
      expect(fixture.repository.transferConnectedSource).not.toHaveBeenCalled();
    } else {
      await user.click(screen.getByRole('button', { name: 'Download selected files' }));
      await waitFor(() =>
        expect(fixture.repository.transferConnectedSource).toHaveBeenCalledWith(
          'w',
          'source-ndp',
          undefined,
          'draft',
          'editable',
          'session_ndp',
        ),
      );
      expect(fixture.repository.linkConnectedSource).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
    }
  },
);
