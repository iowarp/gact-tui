import { cleanup, screen } from '@testing-library/react';
import { renderWithTooltips as render } from '@/test/render-with-tooltips';
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
    settings: { endpoint: 'http://127.0.0.1', label: 'Local research service' },
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
import { sessionReads } from '@/test/session-reads';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.3'] });
  mocks.repository.workspaces.mockResolvedValue([]);
  mocks.repository.allSessions.mockResolvedValue([]);
});
afterEach(cleanup);

const ADDRESS_EXAMPLE = 'https://homelab.example.org:8100';

// The field starts empty under the example placeholder; the person types the address.
async function connectByAddress() {
  await userEvent.type(screen.getByLabelText('Connection address'), 'http://127.0.0.1:17800');
  await userEvent.click(screen.getByRole('button', { name: 'Connect' }));
}

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
  const address = screen.getByLabelText('Connection address');
  expect(address).toHaveValue('');
  expect(address).toHaveAccessibleDescription(
    expect.stringContaining(`Use the agent service address, for example ${ADDRESS_EXAMPLE}.`),
  );
  await connectByAddress();
  expect(await screen.findByText(/No agent service was found at this address/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Diagnostic details' }));
  expect(screen.getByText(/Request failed with 404 Not Found/)).toBeVisible();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it('retains an authentication refusal instead of suggesting a different address', async () => {
  mocks.repository.capabilities.mockRejectedValue(
    new TransportError('Access token required', 401, 'auth_required'),
  );
  renderConnection();
  await connectByAddress();
  expect(await screen.findByText('this agent needs an access token.')).toBeVisible();
  expect(screen.queryByText(/No agent service was found/)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Diagnostic details' }));
  expect(screen.getByText(/Access token required/)).toBeVisible();
});

it('retains a later API failure after the service has successfully negotiated', async () => {
  mocks.repository.workspaces.mockRejectedValueOnce(
    new TransportError('Workspace endpoint missing', 404),
  );
  renderConnection();
  await connectByAddress();
  expect(await screen.findByText('Workspace endpoint missing')).toBeVisible();
  expect(screen.queryByText(/No agent service was found/)).not.toBeInTheDocument();
});

// The bounded session reads, answered from this test's session list.
Object.assign(
  mocks.repository,
  sessionReads(() => mocks.repository.allSessions()),
);
