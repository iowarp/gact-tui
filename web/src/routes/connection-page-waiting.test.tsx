/**
 * A saved service that is starting, or that has not answered yet (started together with
 * this page), is waited for and opened by itself; it is not shown as a failure.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { useCommandMenuVisibility } from '@/store/command-menu-visibility';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TransportError } from '@clio/core/v3';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  credentialsReady: true,
  forget: vi.fn(async () => undefined),
  rename: vi.fn(),
  managedLabel: undefined as string | undefined,
  inTauri: false,
  managedConnectionReady: false,
  managedConnection: undefined as { endpoint: string; token?: string } | undefined,
  managedBackendStatus: undefined as
    | { kind: 'starting'; detail: 'checking_existing' | 'starting_service' }
    | { kind: 'needs_install' }
    | { kind: 'error'; detail: string }
    | { kind: 'auth_unavailable'; detail: string }
    | undefined,
  credentialError: undefined as string | undefined,
  recents: [] as Array<{ endpoint: string; label?: string; infrastructure?: unknown }>,
  repository: {
    allSessions: vi.fn(),
    capabilities: vi.fn(),
    createSession: vi.fn(),
    serviceHealth: vi.fn(),
    workspaces: vi.fn(),
    infrastructureTargets: vi.fn(async () => []),
    managedServiceCatalog: vi.fn(async () => ({ facts: {}, services: [] })),
  },
  resolveConnection: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => mocks.inTauri }));

vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
    recents: mocks.recents,
    credentialsReady: mocks.credentialsReady,
    managedConnectionReady: mocks.managedConnectionReady,
    managedConnection: mocks.managedConnection,
    managedBackendStatus: mocks.managedBackendStatus,
    credentialError: mocks.credentialError,
    resolveConnection: mocks.resolveConnection,
    connect: mocks.connect,
    forget: mocks.forget,
    rename: mocks.rename,
    managedLabel: mocks.managedLabel,
  }),
}));

import { ConnectionPage } from './connection-page';
import { clearConnectionOutcomes } from '@/lib/connection-outcomes';

beforeEach(() => {
  useCommandMenuVisibility.getState().setOpen(false);
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  clearConnectionOutcomes();
  mocks.credentialsReady = true;
  mocks.inTauri = false;
  mocks.managedConnectionReady = false;
  mocks.managedConnection = undefined;
  mocks.managedBackendStatus = undefined;
  mocks.credentialError = undefined;
  mocks.recents = [];
  mocks.managedLabel = undefined;
  mocks.resolveConnection.mockResolvedValue({
    endpoint: 'http://127.0.0.1:8788',
    label: 'Contained',
  });
  mocks.repository.infrastructureTargets.mockResolvedValue([]);
  mocks.repository.managedServiceCatalog.mockResolvedValue({ facts: {}, services: [] });
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.3'] });
  mocks.repository.serviceHealth.mockResolvedValue({
    healthy: true,
    uptime_s: 60,
    overall_status: 'healthy',
    integrations: [],
  });
  mocks.repository.workspaces.mockResolvedValue([{ id: 'ws_default', name: 'default' }]);
  mocks.repository.allSessions.mockResolvedValue([
    {
      id: 'sess_empty',
      workspace_id: 'ws_default',
      title: 'New conversation',
      archived: false,
      parent_session_id: '',
      last_interaction_at: '',
      updated_at: '2026-09-02T12:00:00Z',
      message_count: 0,
    },
  ]);
  mocks.repository.createSession.mockResolvedValue({
    id: 'sess_new',
    workspace_id: 'ws_default',
    title: 'New conversation',
    message_count: 0,
  });
});

it('waits for a service that has not answered yet and opens it by itself once it is up', async () => {
  mocks.recents = [{ endpoint: 'http://127.0.0.1:17999', label: 'Lab' }];
  mocks.resolveConnection.mockImplementation(async (candidate: { endpoint: string }) => candidate);
  let up = false;
  mocks.repository.capabilities.mockImplementation(async () => {
    if (!up) {
      throw new TransportError(
        'Unable to reach the service at http://127.0.0.1:17999',
        undefined,
        'network_unavailable',
      );
    }
    return { gact_versions: ['0.3'] };
  });
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Open workspace' }));
  expect(await screen.findByText('Waiting for the service to start')).toBeVisible();
  expect(screen.queryByText("Can't connect")).not.toBeInTheDocument();

  up = true; // the service binds its port; the next probe sees it
  await waitFor(() => expect(mocks.connect).toHaveBeenCalled(), { timeout: 5_000 });
});

it('shows a saved service that is still starting as starting, with what it is loading', async () => {
  mocks.recents = [{ endpoint: 'http://127.0.0.1:17999', label: 'Lab' }];
  mocks.resolveConnection.mockImplementation(async (candidate: { endpoint: string }) => candidate);
  mocks.repository.serviceHealth.mockResolvedValue({
    healthy: true,
    uptime_s: 2,
    overall_status: 'ready',
    integrations: [],
    readiness: 'starting',
    starting: ['task_runtime'],
  });
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Starting')).length).toBeGreaterThan(0);
});
