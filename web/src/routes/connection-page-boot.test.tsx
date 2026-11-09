/**
 * First launch of the desktop app: the managed service answers before its task runtime
 * is ready (503 `task_runtime_starting`). The page stays on the boot screen and retries
 * with a backoff until the workspace opens; it never flips to the Connect form (#739 B1).
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { brand } from '@brand';
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

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));
vi.mock('@/lib/connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/connection')>();
  return { ...actual, createRepository: () => mocks.repository };
});
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:8788' },
    recents: [],
    credentialsReady: true,
    managedConnectionReady: true,
    managedConnection: { endpoint: 'http://127.0.0.1:8788', token: 'launch-token' },
    resolveConnection: mocks.resolveConnection,
    connect: mocks.connect,
    forget: vi.fn(),
    rename: vi.fn(),
  }),
}));

import { ConnectionPage } from './connection-page';
import { sessionReads } from '@/test/session-reads';

const starting = () =>
  new TransportError('The task runtime is starting.', 503, 'task_runtime_starting');

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

afterEach(cleanup);

/** Records whether the Connect form was ever on screen, including for a single commit. */
function watchForConnectForm(): { seen: () => boolean; stop: () => void } {
  let seen = false;
  const check = () => {
    if (screen.queryByRole('button', { name: /Open workspace|Connect/ })) seen = true;
  };
  const observer = new MutationObserver(check);
  observer.observe(document.body, { childList: true, subtree: true });
  return { seen: () => (check(), seen), stop: () => observer.disconnect() };
}

function renderFirstLaunch() {
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

it('stays on the boot screen through a starting task runtime and opens the workspace once', async () => {
  mocks.repository.workspaces
    .mockRejectedValueOnce(starting())
    .mockRejectedValueOnce(starting())
    .mockRejectedValueOnce(starting());
  const form = watchForConnectForm();
  renderFirstLaunch();

  expect(screen.getByRole('heading', { name: `Starting ${brand.name}` })).toBeVisible();
  expect(await screen.findByText('Workspace opened', {}, { timeout: 8_000 })).toBeVisible();
  form.stop();

  expect(form.seen()).toBe(false);
  expect(mocks.repository.workspaces).toHaveBeenCalledTimes(4);
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it("retries no sooner than the service's Retry-After", async () => {
  mocks.repository.workspaces.mockRejectedValueOnce(
    new TransportError(
      'Durable task services are starting.',
      503,
      'task_runtime_starting',
      { readiness: 'starting', starting: ['task_runtime'] },
      1_000,
    ),
  );
  renderFirstLaunch();

  await waitFor(() => expect(mocks.repository.workspaces).toHaveBeenCalledOnce());
  // The plain backoff would have retried after 250 ms.
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(mocks.repository.workspaces).toHaveBeenCalledOnce();
  expect(await screen.findByText('Workspace opened', {}, { timeout: 4_000 })).toBeVisible();
  expect(mocks.repository.workspaces).toHaveBeenCalledTimes(2);
});

it('waits for /v1/health readiness before reading workspaces', async () => {
  mocks.repository.serviceHealth
    .mockResolvedValueOnce({
      healthy: true,
      uptime_s: 1,
      overall_status: 'ready',
      integrations: [],
      readiness: 'starting',
      starting: ['task_runtime'],
    })
    .mockResolvedValueOnce({
      healthy: true,
      uptime_s: 1,
      overall_status: 'ready',
      integrations: [],
      readiness: 'starting',
      starting: ['task_runtime'],
    });
  const form = watchForConnectForm();
  renderFirstLaunch();

  expect(await screen.findByText('Workspace opened', {}, { timeout: 8_000 })).toBeVisible();
  form.stop();

  expect(form.seen()).toBe(false);
  expect(mocks.repository.workspaces).toHaveBeenCalledOnce();
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it('shows a non-transient failure once instead of retrying it', async () => {
  mocks.repository.capabilities.mockResolvedValue({ gact_versions: ['0.1'] });
  renderFirstLaunch();

  expect(await screen.findByText("Can't connect")).toBeVisible();
  await new Promise((resolve) => setTimeout(resolve, 600));
  await waitFor(() => expect(mocks.resolveConnection).toHaveBeenCalledOnce());
  expect(mocks.connect).not.toHaveBeenCalled();
});

// The bounded session reads, answered from this test's session list.
Object.assign(
  mocks.repository,
  sessionReads(() => mocks.repository.allSessions()),
);
