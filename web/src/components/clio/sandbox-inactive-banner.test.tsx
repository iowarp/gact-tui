import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { SandboxInactiveBanner } from './sandbox-inactive-banner';

const mocks = vi.hoisted(() => ({ status: vi.fn(), health: vi.fn() }));
vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({ sandboxStatus: mocks.status, serviceHealth: mocks.health }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    credentialsReady: true,
    settings: { endpoint: 'http://clio.test' },
  }),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const inactive = {
  name: 'sandbox',
  status: 'degraded',
  resolved: true,
  active: false,
  mechanism: 'none',
  acknowledgement_required: true,
  reason: 'codex_not_installed',
  warning: 'Agent commands will run without OS isolation.',
  next_action: 'Reinstall CLIO Desktop.',
  setup_in_progress: false,
};
const active = {
  ...inactive,
  status: 'ready',
  active: true,
  mechanism: 'codex',
  acknowledgement_required: false,
  reason: undefined,
  warning: undefined,
};

/** Refetch, then let React Query's batched notification reach the component. */
const refetch = (client: QueryClient) =>
  act(async () => {
    await client.refetchQueries();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

function renderBanner() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SandboxInactiveBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { client, ...view };
}

it('asks for acknowledgement with the reason and next step, then stays dismissed for this verdict', async () => {
  mocks.status.mockResolvedValue(inactive);
  const { client } = renderBanner();
  const banner = await screen.findByRole('alert', { name: 'Protected execution is off' });
  expect(banner).toHaveTextContent('Agent commands will run without OS isolation.');
  expect(banner).toHaveTextContent('Codex not installed. Next step: Reinstall CLIO Desktop.');

  await userEvent.click(screen.getByRole('button', { name: 'Continue without protection' }));
  expect(screen.queryByRole('alert')).toBeNull();
  await refetch(client);
  expect(screen.queryByRole('alert')).toBeNull();
  client.clear();
});

it('shows nothing while the fence is resolving, and nothing once it is active', async () => {
  mocks.status.mockResolvedValueOnce({ ...inactive, resolved: false }).mockResolvedValue(active);
  const { client } = renderBanner();
  await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole('alert')).toBeNull();
  await refetch(client);
  await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('alert')).toBeNull();
  client.clear();
});

it('clears when protection turns on and asks again after the service reboots unprotected', async () => {
  mocks.status.mockResolvedValue(inactive);
  const { client } = renderBanner();
  await screen.findByRole('alert');
  mocks.status.mockResolvedValue(active);
  await refetch(client);
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

  mocks.status.mockResolvedValue(inactive);
  await refetch(client);
  await userEvent.click(await screen.findByRole('button', { name: 'Continue without protection' }));
  mocks.status.mockResolvedValue({ ...inactive, resolved: false });
  await refetch(client);
  mocks.status.mockResolvedValue(inactive);
  await refetch(client);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  client.clear();
});

it('falls back to the health row when the service has no sandbox route', async () => {
  mocks.status.mockRejectedValue(new Error('404'));
  mocks.health.mockResolvedValue({
    healthy: true,
    uptime_s: 1,
    overall_status: 'degraded',
    integrations: [
      { name: 'api', status: 'ready' },
      { name: 'sandbox', status: 'unavailable', summary: 'No OS write fence is available.' },
    ],
  });
  const { client } = renderBanner();
  expect(await screen.findByRole('alert')).toHaveTextContent('No OS write fence is available.');
  client.clear();
});
