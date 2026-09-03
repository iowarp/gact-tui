import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => undefined),
  forget: vi.fn(async () => undefined),
  recents: [] as Array<{ endpoint: string; label?: string }>,
  repository: {
    allSessions: vi.fn(),
    capabilities: vi.fn(),
    createSession: vi.fn(),
    serviceHealth: vi.fn(),
    workspaces: vi.fn(),
  },
  resolveConnection: vi.fn(),
}));

vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788', label: 'Contained' },
    recents: mocks.recents,
    credentialsReady: true,
    managedConnectionReady: false,
    credentialError: undefined,
    resolveConnection: mocks.resolveConnection,
    connect: mocks.connect,
    forget: mocks.forget,
  }),
}));

import { ConnectionPage } from './connection-page';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.recents = [];
  mocks.resolveConnection.mockResolvedValue({
    endpoint: 'http://127.0.0.1:8788',
    label: 'Contained',
  });
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
    id: 'sess_created',
    workspace_id: 'ws_default',
    title: 'New conversation',
    message_count: 0,
  });
});

it('separates saved services from new connection fields and exposes the endpoint', async () => {
  mocks.recents = [
    { endpoint: 'http://127.0.0.1:8788', label: 'Contained campaign qualification' },
  ];
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

  expect(screen.getByText('http://127.0.0.1:8788')).toBeVisible();
  expect(screen.queryByLabelText('Service name')).not.toBeInTheDocument();
  expect(await screen.findAllByText('Ready')).not.toHaveLength(0);

  await user.click(screen.getByRole('button', { name: 'Add a service' }));

  expect(screen.getByLabelText('Service name')).toBeVisible();
  expect(screen.getByLabelText('Connection address')).toBeVisible();
  expect(screen.queryByText('Saved services', { selector: 'legend' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: /Access token/ }));
  expect(screen.getByPlaceholderText('Paste token')).toBeVisible();
});

it('greys out an unavailable saved service and prevents opening it', async () => {
  mocks.recents = [{ endpoint: 'http://127.0.0.1:9999', label: 'Offline lab' }];
  mocks.repository.capabilities.mockRejectedValue(new Error('Connection refused'));
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

  expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { pressed: true })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();
});

afterEach(cleanup);

it('opens an existing workspace session after a successful connection', async () => {
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
          <Route
            element={<div>Connected workspace session</div>}
            path="/workspaces/:workspaceId/sessions/:sessionId"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Connected workspace session')).toBeVisible();
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(mocks.repository.createSession).not.toHaveBeenCalled();
});

it('creates the reusable empty base-agent session when every conversation has content', async () => {
  mocks.repository.allSessions.mockResolvedValue([
    {
      id: 'sess_existing',
      workspace_id: 'ws_default',
      title: 'Completed review',
      archived: false,
      parent_session_id: '',
      last_interaction_at: '2026-09-02T12:00:00Z',
      updated_at: '2026-09-02T12:00:00Z',
      created_at: '2026-09-02T11:00:00Z',
      message_count: 4,
    },
  ]);
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
          <Route
            element={<div>Empty base-agent session</div>}
            path="/workspaces/:workspaceId/sessions/:sessionId"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Connect' }));

  expect(await screen.findByText('Empty base-agent session')).toBeVisible();
  expect(mocks.repository.createSession).toHaveBeenCalledWith({
    workspace_id: 'ws_default',
    title: 'New conversation',
  });
});
