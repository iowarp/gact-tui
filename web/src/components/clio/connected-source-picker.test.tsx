import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectionScope } from '@/lib/connection-scope';

const fixtures = vi.hoisted(() => ({
  endpoint: 'https://clio-one',
  token: 'one',
  repository: {
    connectedSources: vi.fn(),
    storageProviders: vi.fn(),
    hostStorageSettings: vi.fn(),
    sourceOperations: vi.fn(),
    browseConnectedSource: vi.fn(),
    transferConnectedSource: vi.fn(),
    attachSourceFile: vi.fn(),
    createConnectedSource: vi.fn(),
  },
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => fixtures.repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: fixtures.endpoint, token: fixtures.token },
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
};
beforeEach(() => {
  vi.resetAllMocks();
  fixtures.endpoint = 'https://clio-one';
  fixtures.token = 'one';
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
  });
  fixtures.repository.sourceOperations.mockResolvedValue([]);
  fixtures.repository.browseConnectedSource.mockResolvedValue({
    entries: [{ path: 'input.csv', kind: 'file', size: 12, revision: 'r1' }],
    next_offset: null,
  });
});
afterEach(cleanup);

describe('connected source picker', () => {
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
    await user.click(await screen.findByRole('button', { name: /OPAL inputs/ }));
    await user.click(await screen.findByRole('button', { name: 'Attach' }));
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
    await user.click(await screen.findByRole('button', { name: /OPAL inputs/ }));
    await user.click(screen.getByRole('button', { name: 'Refresh inputs' }));
    await waitFor(() =>
      expect(fixtures.repository.transferConnectedSource).toHaveBeenCalledWith('w', 's1'),
    );
    expect(screen.getByRole('heading', { name: 'OPAL inputs' })).toBeInTheDocument();
    expect(await screen.findByText('input.csv')).toBeInTheDocument();
    fixtures.repository.attachSourceFile.mockResolvedValue({
      id: 'res_one',
      name: 'input.csv',
      revision: 1,
      detected_mime: 'text/csv',
    });
    await user.click(screen.getByRole('button', { name: 'Attach' }));
    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: 'resource',
          id: 'res_one',
          detail: 'OPAL inputs · input.csv',
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

  it('disables modes the provider cannot deliver and explains them on tap', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConnectedSourcePicker workspaceId="w" open onOpenChange={vi.fn()} />
      </QueryClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /^Connect$/ }));
    expect(screen.getByRole('radio', { name: 'Read only' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Working copy' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Write enabled' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'About Write enabled' }));
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'A transfer is not a writable folder.',
    );
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
      await user.click(await screen.findByRole('button', { name: /OPAL inputs/ }));
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
