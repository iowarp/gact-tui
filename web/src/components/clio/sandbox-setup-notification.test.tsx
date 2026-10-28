import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { queryKeys } from '@/lib/query-keys';
import { SandboxSetupNotification } from './sandbox-setup-notification';

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  loading: vi.fn(),
  success: vi.fn(),
  message: vi.fn(),
}));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ sandboxStatus: mocks.status }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    credentialsReady: true,
    settings: { endpoint: 'http://clio.test' },
  }),
}));
vi.mock('sonner', () => ({
  toast: { dismiss: vi.fn(), loading: mocks.loading, success: mocks.success, message: mocks.message },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('reports a failed startup check even when an older fence receipt is ready', async () => {
  mocks.status.mockResolvedValue({
    status: 'ready',
    setup_in_progress: false,
    next_action: 'No action required.',
    setup_progress: {
      status: 'failed',
      detail: 'Runtime access verification failed.',
      started_at: '2026-10-13T20:01:00Z',
      elapsed_seconds: 60,
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SandboxSetupNotification />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(mocks.message).toHaveBeenCalledWith(
      'Protected execution needs attention',
      expect.objectContaining({ description: 'Runtime access verification failed.' }),
    ),
  );
  expect(mocks.success).not.toHaveBeenCalled();
  client.clear();
});

it('follows a service-owned setup from a conversation and reports its completion', async () => {
  const progress = {
    status: 'running',
    detail: 'Verifying protected execution...',
    started_at: '2026-10-13T20:00:00Z',
    elapsed_seconds: 367,
  };
  mocks.status.mockResolvedValue({
    status: 'degraded',
    setup_in_progress: true,
    setup_progress: progress,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/workspaces/ws/sessions/session']}>
        <SandboxSetupNotification />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(mocks.loading).toHaveBeenCalledWith(
      'Setting up protected execution',
      expect.objectContaining({ description: expect.stringContaining('6 min 7 s') }),
    ),
  );
  mocks.status.mockResolvedValue({
    status: 'ready',
    setup_in_progress: false,
    setup_progress: { ...progress, status: 'ready' },
  });
  await act(async () => {
    await client.invalidateQueries({
      queryKey: queryKeys.key('sandbox-status', 'http://clio.test'),
    });
  });
  await waitFor(() =>
    expect(mocks.success).toHaveBeenCalledWith(
      'Protected execution is ready',
      expect.objectContaining({ id: 'sandbox-setup:http://clio.test' }),
    ),
  );
  client.clear();
});
