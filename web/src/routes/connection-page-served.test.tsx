/**
 * A web UI served by the agent itself (at its own origin) with nothing remembered
 * connects to its own origin by itself; when nothing answers there the person gets the
 * manual form, starting from that origin. Under a Vite dev server nothing changes (#739 B7).
 */
import { cleanup, screen } from '@testing-library/react';
import { renderWithTooltips as render } from '@/test/render-with-tooltips';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransportError } from '@clio/core/v3';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  repository: {
    allSessions: vi.fn(),
    capabilities: vi.fn(),
    serviceHealth: vi.fn(),
    workspaces: vi.fn(),
    infrastructureTargets: vi.fn(async () => []),
    managedServiceCatalog: vi.fn(async () => ({ facts: {}, services: [] })),
  },
  resolveConnection: vi.fn(),
}));

vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', async () => {
  const { defaultEndpoint } = await import('@/lib/connection');
  return {
    useConnectionSettings: () => ({
      settings: { endpoint: defaultEndpoint() },
      recents: [],
      credentialsReady: true,
      managedConnectionReady: false,
      resolveConnection: mocks.resolveConnection,
      connect: mocks.connect,
      forget: vi.fn(),
      rename: vi.fn(),
    }),
  };
});

import { ConnectionPage } from './connection-page';
import { sessionReads } from '@/test/session-reads';

const pageOrigin = window.location.origin;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  mocks.resolveConnection.mockImplementation(async (candidate: unknown) => candidate);
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.3'] });
  mocks.repository.serviceHealth.mockResolvedValue({
    healthy: true,
    uptime_s: 4,
    overall_status: 'healthy',
    integrations: [],
    readiness: 'ready',
  });
  mocks.repository.workspaces.mockResolvedValue([{ id: 'ws_default', name: 'default' }]);
  mocks.repository.allSessions.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
          <Route element={<p>Workspace opened</p>} path="/workspaces/*" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

it('connects an agent-served page to its own origin when nothing is remembered', async () => {
  vi.stubEnv('DEV', false);
  renderPage();

  expect(await screen.findByText('Workspace opened')).toBeVisible();
  expect(mocks.resolveConnection).toHaveBeenCalledOnce();
  expect(mocks.resolveConnection).toHaveBeenCalledWith({ endpoint: pageOrigin });
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it('offers an empty manual form when nothing answers at the page origin', async () => {
  vi.stubEnv('DEV', false);
  mocks.repository.capabilities.mockRejectedValue(
    new TransportError('Nothing answered.', 0, 'network_unavailable'),
  );
  renderPage();

  // The page origin is not an address the person chose, so the field stays empty.
  const address = await screen.findByRole('textbox', { name: 'Connection address' });
  expect(address).toHaveValue('');
  expect(address).toHaveAttribute('placeholder', 'https://homelab.example.org:8100');
  expect(mocks.repository.capabilities).toHaveBeenCalled();
  expect(mocks.resolveConnection).not.toHaveBeenCalled();
});

it('never probes the page origin under a Vite dev server', () => {
  vi.stubEnv('DEV', true);
  renderPage();

  expect(screen.getByRole('textbox', { name: 'Connection address' })).toHaveValue('');
  expect(mocks.repository.capabilities).not.toHaveBeenCalled();
});

Object.assign(
  mocks.repository,
  sessionReads(() => mocks.repository.allSessions()),
);
