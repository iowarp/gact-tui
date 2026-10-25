import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransportError } from '@clio/core/v3';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  repository: { capabilities: vi.fn(), workspaces: vi.fn(), allSessions: vi.fn() },
}));

vi.mock('@/hooks/use-known-connections', () => ({ useKnownConnections: () => [] }));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8787', label: 'Local research service' },
    recents: [],
    credentialsReady: true,
    managedConnectionReady: false,
    connect: mocks.connect,
    resolveConnection: async (settings: unknown) => settings,
  }),
}));
vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});

import { ConnectionPage } from './connection-page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.3'] });
  mocks.repository.workspaces.mockResolvedValue([]);
  mocks.repository.allSessions.mockResolvedValue([]);
});
afterEach(cleanup);

function renderConnection() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <ConnectionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('explains a missing service address and retains the HTTP failure for inspection', async () => {
  mocks.repository.capabilities.mockRejectedValue(
    new TransportError('Request failed with 404 Not Found', 404),
  );
  renderConnection();
  expect(screen.getByLabelText('Connection address')).toHaveAccessibleDescription(
    /Use the agent service address, for example http:\/\/127\.0\.0\.1:8787/,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText(/No agent service was found at this address/)).toBeVisible();
  await userEvent.click(screen.getByText('Diagnostic details'));
  expect(screen.getByText(/Request failed with 404 Not Found/)).toBeVisible();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it('retains an authentication refusal instead of suggesting a different address', async () => {
  mocks.repository.capabilities.mockRejectedValue(
    new TransportError('Access token required', 401, 'auth_required'),
  );
  renderConnection();
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('Access token required')).toBeVisible();
  expect(screen.queryByText(/No agent service was found/)).not.toBeInTheDocument();
});

it('retains a later API failure after the service has successfully negotiated', async () => {
  mocks.repository.workspaces.mockRejectedValueOnce(
    new TransportError('Workspace endpoint missing', 404),
  );
  renderConnection();
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
  expect(await screen.findByText('Workspace endpoint missing')).toBeVisible();
  expect(screen.queryByText(/No agent service was found/)).not.toBeInTheDocument();
});
