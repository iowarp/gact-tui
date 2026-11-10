import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderWithTooltips as render } from '@/test/render-with-tooltips';
import { useCommandMenuVisibility } from '@/store/command-menu-visibility';
import { brand } from '@brand';
import { vocab } from '@/lib/brand-vocabulary';
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
import { clearConnectionOutcomes, connectionOutcomes } from '@/lib/connection-outcomes';
import { InfrastructureTargetGoneError } from '@/lib/connection';
import { TransportError } from '@clio/core/v3';
import { rememberWorkspaceRoute } from '@/lib/workspace-route-memory';
import { sessionReads } from '@/test/session-reads';

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

  expect(screen.getByRole('heading', { name: `Starting local ${brand.agentName}` })).toBeVisible();
  expect(screen.getByRole('listitem', { current: 'step' })).toHaveTextContent(
    'Starting the local service',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Startup details' }));
  expect(screen.getByText('Loading the bundled scientific workspace')).toBeVisible();
  expect(screen.getByRole('list', { name: 'Startup progress' })).toBeVisible();
  expect(screen.queryByLabelText('Connection address')).not.toBeInTheDocument();
});

it('keeps global search open on first launch and resumes workspace opening after it closes', async () => {
  mocks.inTauri = true;
  mocks.managedConnectionReady = true;
  mocks.managedConnection = { endpoint: 'http://127.0.0.1:8788' };
  useCommandMenuVisibility.getState().setOpen(true);
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
        })
      }
    >
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ConnectionPage />} />
          <Route path="/workspaces/*" element={<p>Workspace opened</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(mocks.resolveConnection).not.toHaveBeenCalled();
  await act(async () => useCommandMenuVisibility.getState().setOpen(false));
  await waitFor(() => expect(mocks.resolveConnection).toHaveBeenCalledOnce());
  expect(await screen.findByText('Workspace opened')).toBeVisible();
});

it('defers an in-flight startup navigation until global search closes', async () => {
  // Managed startup has no saved-service probe competing for this controlled promise.
  mocks.inTauri = true;
  mocks.managedConnectionReady = true;
  mocks.managedConnection = { endpoint: 'http://127.0.0.1:8788' };
  let finishConnection: (value: { endpoint: string }) => void = () => undefined;
  mocks.resolveConnection.mockReturnValueOnce(
    new Promise<{ endpoint: string }>((resolve) => {
      finishConnection = resolve;
    }),
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<ConnectionPage />} />
          <Route path="/workspaces/*" element={<p>Workspace opened</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mocks.resolveConnection).toHaveBeenCalledOnce());
  await act(async () => {
    useCommandMenuVisibility.getState().setOpen(true);
    finishConnection({ endpoint: 'http://127.0.0.1:8788' });
  });
  // The landing form returns only after the mutation has finished successfully.
  expect(await screen.findByRole('button', { name: 'Add an agent…' })).toBeVisible();
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(screen.queryByText('Workspace opened')).not.toBeInTheDocument();
  await act(async () => useCommandMenuVisibility.getState().setOpen(false));
  expect(await screen.findByText('Workspace opened')).toBeVisible();
  expect(mocks.resolveConnection).toHaveBeenCalledOnce();
});

it('identifies a failed local startup without claiming the saved token was lost (#1777)', () => {
  mocks.inTauri = true;
  const detail = 'document_install.py: error: unrecognized arguments: --reuse-installed';
  mocks.managedBackendStatus = { kind: 'error', detail };
  mocks.credentialError = detail;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ConnectionPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  expect(screen.getByText(`Local ${vocab.agent} could not start`)).toBeVisible();
  expect(screen.getByText(detail)).toBeVisible();
  expect(screen.queryByText('Saved access token unavailable')).not.toBeInTheDocument();
});

it('says up front that the desktop cannot sign in to an already-running agent (#1478)', () => {
  mocks.inTauri = true;
  mocks.managedBackendStatus = {
    kind: 'auth_unavailable',
    detail: 'it did not publish its access token',
  };
  mocks.credentialError = `${brand.name} is already running at http://127.0.0.1:17800, but this app can't sign in to it: it did not publish its access token.`;
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

  expect(screen.getByText(`Can't sign in to the running ${vocab.agent}`)).toBeVisible();
  expect(screen.getByText(/did not publish its access token/u)).toBeVisible();
  expect(screen.queryByText('Saved access token unavailable')).not.toBeInTheDocument();
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

  expect(screen.getByText('Contained campaign qualification')).toBeVisible();
  expect(screen.getByText('127.0.0.1:8788')).toBeVisible();
  expect(screen.queryByLabelText('Service name')).not.toBeInTheDocument();
  expect(await screen.findAllByText('Ready')).not.toHaveLength(0);

  await user.click(screen.getByRole('button', { name: 'Add an agent…' }));

  expect(screen.getByLabelText('Service name')).toBeVisible();
  expect(screen.getByLabelText('Connection address')).toBeVisible();
  expect(screen.queryByText('Saved services', { selector: 'legend' })).not.toBeInTheDocument();

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
  expect(screen.queryByText('Switch to', { selector: 'legend' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add an agent…' })).not.toBeInTheDocument();
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

  expect(screen.getByText(`${brand.agentName} local`)).toBeVisible();
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
            element={<div>Connected workspace draft</div>}
            path="/workspaces/:workspaceId/new"
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const item = screen.getByText('Lab instrument').closest('button');
  if (!item) throw new Error('known connection button not found');
  await user.click(item);
  await user.click(screen.getByRole('button', { name: 'Open workspace' }));

  expect(await screen.findByText('Connected workspace draft')).toBeVisible();
  expect(mocks.connect).toHaveBeenCalledOnce();
  expect(mocks.repository.createSession).not.toHaveBeenCalled();
});

it('opens only the manual form from "Add an agent…" -- never a deploy action', async () => {
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

  await user.click(screen.getByRole('button', { name: 'Add an agent…' }));

  expect(screen.getByLabelText('Service name')).toBeVisible();
  expect(screen.getByLabelText('Connection address')).toBeVisible();
  expect(screen.queryByRole('dialog', { name: /Deploy/ })).not.toBeInTheDocument();
  expect(mocks.repository.infrastructureTargets).not.toHaveBeenCalled();
});

it('shows the manual form -- never a reconnect screen -- after "Add an agent…" once auto-connect has settled', async () => {
  // No `intent=connect`: this is the real flow the owner hit live. CLIO
  // auto-connects to the one remembered service on plain load, that
  // connection fails (the service is offline), and only THEN does the
  // person reach for "Add an agent…".
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

  expect(await screen.findByText("Can't connect")).toBeVisible();

  await user.click(screen.getByRole('button', { name: 'Add an agent…' }));

  // `mutation.reset()` (fired by that click, to clear the stale error) used
  // to return `mutation.status` to 'idle', which a boot-screen gate read as
  // "about to auto-connect" and re-showed the full-screen loader -- one
  // that could never finish, since the one-shot auto-connect had already
  // run and would never fire again.
  expect(screen.getByLabelText('Service name')).toBeVisible();
  expect(screen.getByLabelText('Connection address')).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: `Starting local ${brand.agentName}` }),
  ).not.toBeInTheDocument();
  expect(mocks.connect).not.toHaveBeenCalled();
});

it('marks a known service that does not answer as failed, with Retry, as soon as connecting to it fails', async () => {
  mocks.recents = [{ endpoint: 'http://127.0.0.1:17999' }];
  mocks.repository.capabilities.mockRejectedValue(
    new TransportError(
      'Unable to reach the service at http://127.0.0.1:17999',
      undefined,
      'network_unavailable',
    ),
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

  // The real connect attempt against this exact endpoint settles the row at once,
  // without waiting on the SEPARATE background probe's slower retry/backoff
  // schedule (CONNECTION_PROBE_RETRY_BASE_MS/MAX_MS). The tight timeout can only
  // pass through the mutation-tied state, not a coincidentally fast probe.
  await waitFor(
    () =>
      expect(screen.getByText("Can't connect: no answer from 127.0.0.1:17999")).toBeInTheDocument(),
    { timeout: 200 },
  );
  // The row leads with the agent's name, even unnamed; the address is in the error line.
  expect(
    screen.getByRole('button', { name: `${brand.agentName} local`, pressed: true }),
  ).toBeVisible();
  expect(screen.queryByText('127.0.0.1:17999')).not.toBeInTheDocument();
  // The row says why and offers Retry; the form does not repeat it, and the
  // service cannot be opened until it answers.
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();
});

it('offers to remove and redeploy a saved connection whose infrastructure target is gone (#1528)', async () => {
  mocks.inTauri = true;
  mocks.recents = [
    {
      endpoint: 'http://127.0.0.1:43123',
      label: 'Ares lab',
      infrastructure: { targetId: 'gone-target', serviceId: 'clio_agent' },
    },
  ];
  mocks.resolveConnection.mockRejectedValue(new InfrastructureTargetGoneError('Ares lab'));
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

  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(
    'Ares lab is not known on this computer. Remove it and deploy it again to reconnect.',
  );
  const recover = within(alert).getByRole('button', { name: 'Remove and redeploy' });

  await user.click(recover);

  expect(mocks.forget).toHaveBeenCalledWith('http://127.0.0.1:43123');
  // The typed error's recovery action opens the deploy flow instead of
  // stranding the person on a dead alert with no way forward.
  expect(await screen.findByRole('dialog', { name: /Deploy/u })).toBeVisible();
  expect(screen.queryByText("Can't connect")).not.toBeInTheDocument();
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

it('keeps a service the probe cannot reach closed, and lets Retry make the real connection attempt', async () => {
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

  // A local failure is not reported as "no answer"; the row gives what happened.
  expect(await screen.findByText("Can't connect: Connection refused")).toBeVisible();
  expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();

  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));

  // The attempt's own reason is shown once, in the form; the row keeps its short state,
  // so the form line does not repeat the row's "Can't connect".
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent(/^Connection refused$/u);
  expect(mocks.repository.capabilities.mock.calls.length).toBeGreaterThan(3);
});

afterEach(cleanup);

it('opens an existing workspace session after a successful connection', async () => {
  rememberWorkspaceRoute('http://127.0.0.1:8788', 'ws_default', 'sess_empty');
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

it.each([undefined, 0, 4])(
  'opens a draft without creating a session (message_count=%s)',
  async (messageCount) => {
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
        message_count: messageCount,
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
              element={<div>Presentation-only draft</div>}
              path="/workspaces/:workspaceId/new"
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Connect' }));

    expect(await screen.findByText('Presentation-only draft')).toBeVisible();
    expect(mocks.repository.createSession).not.toHaveBeenCalled();
  },
);

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

it('auto-connects to a draft without minting a persistent session', async () => {
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
          <Route element={<div>Presentation-only draft</div>} path="/workspaces/:workspaceId/new" />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Presentation-only draft')).toBeVisible();
  expect(mocks.repository.createSession).not.toHaveBeenCalled();
  expect(connectionOutcomes().some((outcome) => outcome.code === 'session_minted')).toBe(false);
});

// The bounded session reads, answered from this test's session list.
Object.assign(
  mocks.repository,
  sessionReads(() => mocks.repository.allSessions()),
);
