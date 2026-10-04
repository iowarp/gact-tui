import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  hostStorageSettings: vi.fn(),
  saveHostStorageSettings: vi.fn(),
  inspectHostPath: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({ useRepository: () => repository }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({ settings: { endpoint: 'https://clio' } }),
}));
import { HostStorageSettings } from './host-storage-settings';

const requested = { root: '/data/old', models: '', service_data: '', captures: '', temporary: '' };
const defaults = {
  root: '/home/clio',
  models: '/home/clio/models',
  service_data: '/home/clio/services',
  captures: '/home/clio/captures',
  temporary: '/home/clio/tmp',
};
beforeEach(() => {
  vi.resetAllMocks();
  repository.hostStorageSettings.mockImplementation(async (id: string) => ({
    target_id: id,
    host_label: id,
    requested,
    defaults,
    effective: { ...defaults, root: '/data/old' },
  }));
  repository.inspectHostPath.mockResolvedValue({ free_bytes: 1024 ** 3, writable: true });
  repository.saveHostStorageSettings.mockImplementation(
    async (id: string, paths: typeof requested) => ({
      target_id: id,
      host_label: id,
      requested: paths,
      defaults,
      effective: paths,
    }),
  );
});
afterEach(cleanup);

describe('host storage settings', () => {
  it('previews inherited paths before saving, resets success when edited, and isolates hosts', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = (targetId: string) => (
      <QueryClientProvider client={client}>
        <HostStorageSettings targetId={targetId} />
      </QueryClientProvider>
    );
    const rendered = render(view('homelab'));
    const user = userEvent.setup();
    const root = await screen.findByLabelText('Storage root');
    await user.click(screen.getByText('Override individual folders'));
    await user.clear(root);
    expect(screen.getByLabelText('Models')).toHaveAttribute('placeholder', '/home/clio/models');
    await user.type(root, '/data/new');
    expect(screen.getByLabelText('Models')).toHaveAttribute('placeholder', '/data/new/models');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save locations' })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: 'Save locations' }));
    await screen.findByText('Locations saved for new deployments.');
    expect(repository.saveHostStorageSettings).toHaveBeenCalledWith('homelab', {
      ...requested,
      root: '/data/new',
    });
    await user.type(root, '-draft');
    expect(screen.queryByText('Locations saved for new deployments.')).not.toBeInTheDocument();
    rendered.rerender(view('ares'));
    await waitFor(() => expect(screen.getByLabelText('Storage root')).toHaveValue('/data/old'));
    expect(repository.hostStorageSettings).toHaveBeenCalledWith('ares', expect.any(AbortSignal));
  });
});
