import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { brand } from '@brand';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    | undefined,
  recents: [] as Array<{ endpoint: string; label?: string }>,
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
    credentialError: undefined,
    resolveConnection: mocks.resolveConnection,
    connect: mocks.connect,
    forget: mocks.forget,
    rename: mocks.rename,
    managedLabel: mocks.managedLabel,
  }),
}));

import { ConnectionPage } from './connection-page';
import { clearConnectionOutcomes, connectionOutcomes } from '@/lib/connection-outcomes';

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  clearConnectionOutcomes();
  mocks.credentialsReady = true;
  mocks.inTauri = false;
  mocks.managedConnectionReady = false;
  mocks.managedConnection = undefined;
  mocks.managedBackendStatus = undefined;
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

it('shows managed startup instead of asking desktop users for a connection address', () => {
  mocks.inTauri = true;
  mocks.credentialsReady = false;
  mocks.managedBackendStatus = { kind: 'starting', detail: 'starting_service' };
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByRole('heading', { name: `Starting ${brand.name}` })).toBeVisible();
  expect(screen.getByText('Starting local service')).toBeVisible();
  expect(screen.getByText('Loading the bundled scientific workspace')).toBeVisible();
  expect(screen.getByRole('list', { name: 'Startup progress' })).toBeVisible();
  expect(screen.getByTestId('desktop-boot-logo')).toHaveClass('translate-x-1', '-translate-y-2');
  expect(screen.queryByLabelText('Connection address')).not.toBeInTheDocument();
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

it('shows the manual form directly when nothing is known yet', () => {
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

  expect(screen.getByLabelText('Service name')).toBeVisible();
  expect(screen.getByLabelText('Connection address')).toBeVisible();
  expect(screen.queryByText('Known services', { selector: 'legend' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add a service' })).not.toBeInTheDocument();
});

it('lists the desktop-managed local service as a known connection, ahead of the manual form', () => {
  mocks.inTauri = true;
  mocks.managedConnectionReady = true;
  mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211', token: 'supervisor-token' };
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

  expect(screen.getByText('This computer')).toBeVisible();
  expect(screen.queryByLabelText('Service name')).not.toBeInTheDocument();
});

it('connects after clicking a known CLIO in the default list', async () => {
  mocks.recents = [{ endpoint: 'http://127.0.0.1:9001', label: 'Lab instrument' }];
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

  const item = screen.getByText('Lab instrument').closest('button');
  if (!item) throw new Error('known connection button not found');
  await user.click(item);
  await user.click(screen.getByRole('button', { name: 'Open workspace' }));

  expect(await screen.findByText('Connected workspace session')).toBeVisible();
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it('opens only the manual form from "Add a service" -- never a deploy action', async () => {
  mocks.inTauri = true;
  mocks.recents = [{ endpoint: 'http://127.0.0.1:8788', label: 'Contained' }];
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

  await user.click(screen.getByRole('button', { name: 'Add a service' }));

  expect(screen.getByLabelText('Service name')).toBeVisible();
  expect(screen.getByLabelText('Connection address')).toBeVisible();
  expect(screen.queryByRole('dialog', { name: /Deploy/ })).not.toBeInTheDocument();
  expect(mocks.repository.infrastructureTargets).not.toHaveBeenCalled();
});

it('shows the manual form -- never a reconnect screen -- after "Add a service" once auto-connect has settled', async () => {
  // No `intent=connect`: this is the real flow the owner hit live. CLIO
  // auto-connects to the one remembered service on plain load, that
  // connection fails (the service is offline), and only THEN does the
  // person reach for "Add a service".
  mocks.recents = [{ endpoint: 'http://127.0.0.1:17999', label: 'Offline lab' }];
  mocks.repository.capabilities.mockRejectedValue(
    new Error('Unable to reach the service at http://127.0.0.1:17999'),
  );
  const user = userEvent.setup();
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Connection unavailable')).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Add a service' }));

  // `mutation.reset()` (fired by that click, to clear the stale error) used
  // to return `mutation.status` to 'idle', which a boot-screen gate read as
  // "about to auto-connect" and re-showed the full-screen loader -- one
  // that could never finish, since the one-shot auto-connect had already
  // run and would never fire again.
  expect(screen.getByLabelText('Service name')).toBeVisible();
  expect(screen.getByLabelText('Connection address')).toBeVisible();
  expect(screen.queryByRole('heading', { name: `Starting ${brand.name}` })).not.toBeInTheDocument();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it("settles a known connection's badge to Unavailable as soon as connecting to it fails", async () => {
  mocks.recents = [{ endpoint: 'http://127.0.0.1:17999', label: 'Offline lab' }];
  mocks.repository.capabilities.mockRejectedValue(
    new Error('Unable to reach the service at http://127.0.0.1:17999'),
  );
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

  // The only known connection is pre-selected by default; submitting
  // attempts it directly.
  await user.click(screen.getByRole('button', { name: 'Open workspace' }));

  expect(await screen.findByText('Connection unavailable')).toBeVisible();
  // The real connect attempt against this exact endpoint already settled
  // (the alert above proves it) -- the row must reflect that immediately,
  // not wait on the SEPARATE background probe's own slower retry/backoff
  // schedule (CONNECTION_PROBE_RETRY_BASE_MS/MAX_MS: 250ms then up to
  // 1000ms between attempts). A tight timeout here is deliberate: it can
  // only pass through the mutation-tied badge, not a coincidentally fast
  // probe settlement.
  await waitFor(() => expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0), {
    timeout: 200,
  });
});

it('shows "Deploy CLIO" only in the Tauri desktop app, never on the web build', () => {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const { rerender } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.queryByRole('button', { name: /Deploy/ })).not.toBeInTheDocument();

  mocks.inTauri = true;
  rerender(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/?intent=connect']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByRole('button', { name: /Deploy/ })).toBeVisible();
});

it('reports a passive probe failure without locking the real connection attempt', async () => {
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
  expect(screen.getByRole('button', { pressed: true })).toBeEnabled();
  const open = screen.getByRole('button', { name: 'Open workspace' });
  expect(open).toBeEnabled();

  await userEvent.setup().click(open);

  expect(await screen.findByText('Connection unavailable')).toBeVisible();
  expect(mocks.repository.capabilities.mock.calls.length).toBeGreaterThan(3);
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

it('offers setup instead of the bare form when a connection resolves no target', async () => {
  mocks.repository.workspaces.mockResolvedValue([]);
  mocks.repository.allSessions.mockResolvedValue([
    {
      id: 'sess_orphaned',
      workspace_id: 'ws_missing',
      title: 'Orphaned conversation',
      archived: false,
      message_count: 2,
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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Connect' }));

  // The connection succeeded; there is simply nothing openable on the far side.
  // Re-rendering the connect form strands the person on a button that already
  // worked, so the branch is keyed on whether a target resolved — not on
  // whether the service happens to have zero sessions.
  expect(await screen.findByText('This service is ready')).toBeVisible();
  expect(screen.getByLabelText('Conversation name')).toBeVisible();
  expect(mocks.connect).toHaveBeenCalledOnce();
});

it('says when it created the conversation the auto-connect landed in', async () => {
  // A remembered service is what makes the page connect without being asked.
  mocks.recents = [{ endpoint: 'http://127.0.0.1:8788', label: 'Contained' }];
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
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<ConnectionPage />} path="/" />
          <Route
            element={<div>Minted session</div>}
            path="/workspaces/:workspaceId/sessions/:sessionId"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Minted session')).toBeVisible();
  // Auto-connect creates a session on the service without being asked. That is
  // a write, and it is recorded with its own reason rather than happening
  // invisibly behind a redirect.
  await waitFor(() =>
    expect(connectionOutcomes().at(-1)).toMatchObject({
      code: 'session_minted',
      sessionId: 'sess_new',
      workspaceId: 'ws_default',
    }),
  );
});

function renderPage() {
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
}

it('renames a known service, refusing a name another service already uses', async () => {
  mocks.recents = [
    { endpoint: 'http://ares.example:17800', label: 'ares lab' },
    { endpoint: 'http://laptop.example:17800', label: 'laptop' },
  ];
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole('button', { name: 'Service actions for ares lab' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const input = await screen.findByLabelText('Name');
  await user.clear(input);
  await user.type(input, 'Laptop');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByText('A service named “Laptop” already exists.')).toBeVisible();
  expect(mocks.rename).not.toHaveBeenCalled();

  await user.clear(input);
  await user.type(input, 'ares GPU queue');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(mocks.rename).toHaveBeenCalledWith(
    expect.objectContaining({ endpoint: 'http://ares.example:17800' }),
    'ares GPU queue',
  );
  // Saving the name only renames: it never submits the connect form around it.
  expect(mocks.connect).not.toHaveBeenCalled();
  expect(mocks.repository.allSessions).not.toHaveBeenCalled();
});

it('forgets a known service only after confirming', async () => {
  mocks.recents = [
    { endpoint: 'http://ares.example:17800', label: 'ares lab' },
    { endpoint: 'http://laptop.example:17800', label: 'laptop' },
  ];
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole('button', { name: 'Service actions for laptop' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Forget on this device' }));
  expect(mocks.forget).not.toHaveBeenCalled();
  const confirm = await screen.findByRole('alertdialog', { name: 'Forget laptop?' });
  await user.click(within(confirm).getByRole('button', { name: 'Forget' }));
  expect(mocks.forget).toHaveBeenCalledWith('http://laptop.example:17800');
});

it('forgetting the selected service selects the next one', async () => {
  mocks.recents = [
    { endpoint: 'http://ares.example:17800', label: 'ares lab' },
    { endpoint: 'http://laptop.example:17800', label: 'laptop' },
  ];
  const user = userEvent.setup();
  renderPage();
  expect(screen.getByRole('button', { name: /ares lab/u, pressed: true })).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Service actions for ares lab' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Forget on this device' }));
  await user.click(
    within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Forget' }),
  );

  expect(mocks.forget).toHaveBeenCalledWith('http://ares.example:17800');
  expect(screen.getByRole('button', { name: /laptop/u, pressed: true })).toBeVisible();
});

it('lets This computer be renamed but never forgotten', async () => {
  mocks.inTauri = true;
  mocks.managedConnectionReady = true;
  mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211', token: 'supervisor-token' };
  const user = userEvent.setup();
  renderPage();

  await user.click(screen.getByRole('button', { name: 'Service actions for This computer' }));
  expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeVisible();
  expect(screen.queryByRole('menuitem', { name: /Forget/u })).not.toBeInTheDocument();
});

it('shows the name the user gave the local service', () => {
  mocks.inTauri = true;
  mocks.managedConnectionReady = true;
  mocks.managedConnection = { endpoint: 'http://127.0.0.1:53211', token: 'supervisor-token' };
  mocks.managedLabel = 'laptop';
  renderPage();

  expect(screen.getByText('laptop')).toBeVisible();
  expect(screen.queryByText('This computer')).not.toBeInTheDocument();
});
