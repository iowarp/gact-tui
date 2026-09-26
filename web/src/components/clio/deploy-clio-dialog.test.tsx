import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';

const mocks = vi.hoisted(() => ({
  attachInfrastructureSshTransport: vi.fn(),
  cancelInfrastructureOperation: vi.fn(),
  cancelSshTransport: vi.fn(),
  closeSshConnectionTest: vi.fn(),
  openSshConnectionTest: vi.fn(),
  createInfrastructureTarget: vi.fn(),
  updateInfrastructureTarget: vi.fn(),
  getManagedBackend: vi.fn(),
  infrastructureOperation: vi.fn(),
  infrastructureTargets: vi.fn(),
  listen: vi.fn(),
  managedServiceCatalog: vi.fn(),
  retryManagedBackend: vi.fn(),
  runManagedServiceAction: vi.fn(),
  setInfrastructureTransportState: vi.fn(),
  sshTransportLog: vi.fn(),
  sshTransportStatus: vi.fn(),
  listSshProfiles: vi.fn(),
  listAllSshProfiles: vi.fn(),
  saveSshProfile: vi.fn(),
  deleteSshProfile: vi.fn(),
  setSshProfileHidden: vi.fn(),
  setSshProfileRoute: vi.fn(),
  waitForManagedBackend: vi.fn(),
  writeSshTransport: vi.fn(),
}));

/** Desktop event handlers the dialog registered, by event name. */
const handlers = new Map<string, (event: { payload: unknown }) => void>();

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    cancelInfrastructureOperation: mocks.cancelInfrastructureOperation,
    createInfrastructureTarget: mocks.createInfrastructureTarget,
    infrastructureOperation: mocks.infrastructureOperation,
    infrastructureTargets: mocks.infrastructureTargets,
    managedServiceCatalog: mocks.managedServiceCatalog,
    runManagedServiceAction: mocks.runManagedServiceAction,
    setInfrastructureTransportState: mocks.setInfrastructureTransportState,
    updateInfrastructureTarget: mocks.updateInfrastructureTarget,
  }),
}));
vi.mock('@/providers/connection-provider', () => ({
  useConnectionSettings: () => ({
    settings: { endpoint: 'http://127.0.0.1:17800', token: 'controller-token' },
  }),
}));
vi.mock('@/tauri/ssh-profiles', () => ({
  listSshProfiles: mocks.listSshProfiles,
  listAllSshProfiles: mocks.listAllSshProfiles,
  saveSshProfile: mocks.saveSshProfile,
  deleteSshProfile: mocks.deleteSshProfile,
  setSshProfileHidden: mocks.setSshProfileHidden,
  setSshProfileRoute: mocks.setSshProfileRoute,
}));
vi.mock('@/tauri/ssh-credentials', () => ({ storeSshIdentity: vi.fn() }));
vi.mock('@/tauri/ssh-infrastructure-transport', () => ({
  attachInfrastructureSshTransport: mocks.attachInfrastructureSshTransport,
  cancelSshTransport: mocks.cancelSshTransport,
  closeSshConnectionTest: mocks.closeSshConnectionTest,
  openSshConnectionTest: mocks.openSshConnectionTest,
  sshTransportLog: mocks.sshTransportLog,
  sshTransportStatus: mocks.sshTransportStatus,
  writeSshTransport: mocks.writeSshTransport,
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: mocks.listen }));
vi.mock('@/tauri/managed-backend', () => ({
  getManagedBackend: mocks.getManagedBackend,
  retryManagedBackend: mocks.retryManagedBackend,
  waitForManagedBackend: mocks.waitForManagedBackend,
}));

import { DeployClioDialog } from './deploy-clio-dialog';

function renderDialog(onReady = vi.fn().mockResolvedValue(undefined)) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeployClioDialog onReady={onReady} />
    </QueryClientProvider>,
  );
  return onReady;
}

/** Deliver one desktop event, as Tauri would. */
function emit(event: string, payload: unknown) {
  act(() => handlers.get(event)?.({ payload }));
}

function step(kind: string, phase: string, detail = '') {
  emit('clio:ssh-transport-step', {
    session_id: 'ssh-homelab',
    request_id: `${kind}-1`,
    kind,
    phase,
    exit_code: phase === 'done' ? 0 : null,
    detail,
  });
}

function stage(name: string) {
  return screen.getByRole('listitem', { name: new RegExp(`^${name}:`, 'u') });
}

async function chooseRemoteHost(user: ReturnType<typeof userEvent.setup>, name = /homelab/u) {
  await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
  await user.click(screen.getByRole('radio', { name: /Remote host/u }));
  await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
  await user.click(screen.getByRole('option', { name }));
}

const runningOperation = {
  id: 'operation-1',
  service_id: 'clio_agent',
  target_id: 'target-homelab',
  action: 'install',
  state: 'running',
  progress: 'Running install',
  logs: '',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  localStorage.clear();
  handlers.clear();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.listen.mockImplementation(
    async (event: string, handler: (event: { payload: unknown }) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    },
  );
  mocks.getManagedBackend.mockResolvedValue({
    url: '',
    bearer_token: '',
    status: { kind: 'starting', detail: 'checking_existing' },
  });
  mocks.listSshProfiles.mockResolvedValue([
    {
      name: 'homelab',
      hostname: '10.0.0.102',
      user: 'alice',
      port: 22,
      jump_hosts: [],
      platform: 'linux',
      managed: false,
    },
  ]);
  mocks.listAllSshProfiles.mockResolvedValue([]);
  mocks.setSshProfileHidden.mockResolvedValue(undefined);
  mocks.saveSshProfile.mockImplementation(async (input) => ({
    name: input.name,
    label: input.label,
    hostname: input.hostname,
    user: input.user,
    port: input.port,
    identity_file: input.identity_file || undefined,
    jump_hosts: input.jump_hosts,
    platform: input.platform,
    install_root: input.install_root || undefined,
    managed: true,
  }));
  mocks.infrastructureTargets.mockResolvedValue([]);
  mocks.createInfrastructureTarget.mockResolvedValue({
    id: 'target-homelab',
    label: 'homelab',
    kind: 'ssh',
    install_root: '',
    ssh: {
      profile: 'homelab',
      host: '10.0.0.102',
      user: 'alice',
      port: 22,
      jump_hosts: [],
      identity_file: '',
      platform: 'linux',
    },
    transport_state: 'connected',
    auto_reconnect: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  mocks.attachInfrastructureSshTransport.mockResolvedValue({
    session_id: 'ssh-homelab',
    state: 'connected',
    reused: false,
    output: '',
    prompt: null,
  });
  mocks.runManagedServiceAction.mockResolvedValue({ ...runningOperation, state: 'succeeded' });
  mocks.managedServiceCatalog.mockResolvedValue({
    facts: {},
    services: [{ id: 'clio_agent', state: 'running', connection_url: 'http://127.0.0.1:64123' }],
  });
  mocks.sshTransportLog.mockResolvedValue('');
  // The remote CLIO's own answer through the tunnel.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
  mocks.writeSshTransport.mockResolvedValue(undefined);
  mocks.cancelSshTransport.mockResolvedValue(undefined);
  mocks.cancelInfrastructureOperation.mockResolvedValue({
    ...runningOperation,
    state: 'cancelled',
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DeployClioDialog', () => {
  it('uses the desktop-managed CLIO service for this computer', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:17800',
      bearer_token: 'local-token',
      status: { kind: 'ready' },
    });

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('button', { name: `Use local ${vocab.agent}` }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith({
        endpoint: 'http://127.0.0.1:17800',
        token: 'local-token',
        label: 'This computer',
        location: 'Local',
      }),
    );
    expect(mocks.runManagedServiceAction).not.toHaveBeenCalled();
  });

  it('retries a failed local backend before waiting for readiness', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    mocks.getManagedBackend.mockResolvedValue({
      url: '',
      bearer_token: '',
      status: { kind: 'error', detail: 'previous boot failed' },
    });
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:64201',
      bearer_token: 'local-token',
      status: { kind: 'ready' },
    });

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('button', { name: `Use local ${vocab.agent}` }));

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(mocks.retryManagedBackend).toHaveBeenCalledOnce();
    expect(mocks.retryManagedBackend.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.waitForManagedBackend.mock.invocationCallOrder[0],
    );
  });

  it('deploys through CLIO ownership and returns a durable managed connection', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith({
        endpoint: 'http://127.0.0.1:64123',
        label: 'homelab',
        location: 'homelab',
        infrastructure: { targetId: 'target-homelab', serviceId: 'clio_agent' },
      }),
    );
    expect(mocks.runManagedServiceAction).toHaveBeenCalledWith('clio_agent', {
      target_id: 'target-homelab',
      action: 'install',
      variant_id: 'released',
      configuration: {},
    });
  });

  it('connects only after the remote CLIO answered through the tunnel, then closes', async () => {
    const user = userEvent.setup();
    let finishConnecting: () => void = () => undefined;
    const onReady = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishConnecting = resolve;
        }),
    );
    renderDialog(onReady);
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() => expect(onReady).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:64123/v1/health', expect.anything());
    // Until the connection itself opens, Connecting is still running.
    expect(stage(`Connecting to ${vocab.agent}`)).toHaveAttribute('data-state', 'running');
    expect(screen.getByRole('dialog', { name: `Deploy ${vocab.agent}` })).toBeVisible();
    finishConnecting();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: `Deploy ${vocab.agent}` }),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps the dialog open on Connecting when the remote CLIO does not answer', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 })));
    const onReady = renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(`Connecting to ${vocab.agent} failed`)).toBeVisible();
    expect(
      within(alert).getByText(`${vocab.agent} did not answer through the tunnel (HTTP 502).`),
    ).toBeVisible();
    expect(stage(`Connecting to ${vocab.agent}`)).toHaveAttribute('data-state', 'failed');
    expect(onReady).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: `Deploy ${vocab.agent}` })).toBeVisible();
  });

  it('keeps the dialog open with the reason when opening the connection fails', async () => {
    const user = userEvent.setup();
    const onReady = vi
      .fn()
      .mockRejectedValue(new Error('This workspace requires a newer service.'));
    renderDialog(onReady);
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('This workspace requires a newer service.')).toBeVisible();
    expect(stage(`Connecting to ${vocab.agent}`)).toHaveAttribute('data-state', 'failed');
    expect(screen.getByRole('dialog', { name: `Deploy ${vocab.agent}` })).toBeVisible();
  });

  it('never connects to a deployed CLIO that is not reported running', async () => {
    const user = userEvent.setup();
    mocks.managedServiceCatalog.mockResolvedValue({
      facts: {},
      services: [{ id: 'clio_agent', state: 'stopped', connection_url: 'http://127.0.0.1:64123' }],
    });
    const onReady = renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByText(`${vocab.agent} on homelab is not running (stopped).`),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('names the deployed service after the destination by default, editable', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    await chooseRemoteHost(user);
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('homelab');

    await user.clear(name);
    await user.type(name, 'ares lab');
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ label: 'ares lab' })),
    );
  });

  it('names the local service This computer by default and uses the typed name', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:17800',
      bearer_token: '',
      status: { kind: 'ready' },
    });
    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    const name = screen.getByLabelText('Name');
    expect(name).toHaveValue('This computer');
    await user.clear(name);
    await user.type(name, 'laptop');
    await user.click(screen.getByRole('button', { name: `Use local ${vocab.agent}` }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ label: 'laptop' })),
    );
  });

  it('requires a name that no other known service uses', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <DeployClioDialog
          knownServices={[
            { endpoint: 'http://laptop:17800', label: 'laptop', source: 'recent' },
            // An earlier deploy to this same host is replaced, not a clash.
            { endpoint: 'http://127.0.0.1:64000', label: 'homelab', location: 'homelab' },
          ]}
          onReady={onReady}
        />
      </QueryClientProvider>,
    );
    await chooseRemoteHost(user);
    const name = screen.getByLabelText('Name');

    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    expect(await screen.findByText('Give this service a name.')).toBeVisible();

    await user.type(name, 'Laptop');
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    expect(await screen.findByText('A service named “Laptop” already exists.')).toBeVisible();
    expect(mocks.createInfrastructureTarget).not.toHaveBeenCalled();

    await user.clear(name);
    await user.type(name, 'homelab');
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith(expect.objectContaining({ label: 'homelab' })),
    );
  });

  it('never deploys from a hop’s host dialog: Test connection and Save host only test and save', async () => {
    const user = userEvent.setup();
    mocks.openSshConnectionTest.mockResolvedValue({
      targetId: 'ssh-test-1',
      status: { session_id: 'ssh-test', state: 'connected', reused: false, output: '' },
    });
    mocks.closeSshConnectionTest.mockResolvedValue(undefined);
    renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Add hop' }));
    await user.click(screen.getByRole('button', { name: 'Add SSH host' }));
    await user.type(screen.getByLabelText('Address'), 'ares-comp-11');

    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await screen.findByText('Connection succeeded');
    await user.type(screen.getByLabelText('Username'), 'alice');
    await user.click(screen.getByRole('button', { name: 'Save host' }));
    await waitFor(() => expect(mocks.saveSshProfile).toHaveBeenCalledOnce());

    expect(mocks.openSshConnectionTest).toHaveBeenCalledWith(
      expect.objectContaining({ host: 'ares-comp-11', jump_hosts: ['homelab'] }),
    );
    expect(mocks.createInfrastructureTarget).not.toHaveBeenCalled();
    expect(mocks.attachInfrastructureSshTransport).not.toHaveBeenCalled();
    expect(mocks.runManagedServiceAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Deploy and connect' })).toBeEnabled();
  });

  it('has no dialog-level installation settings; the destination’s own settings apply', async () => {
    const user = userEvent.setup();
    mocks.listSshProfiles.mockResolvedValue([
      {
        name: 'homelab',
        hostname: '10.0.0.102',
        user: 'alice',
        port: 22,
        jump_hosts: [],
        platform: 'linux',
        install_root: '/mnt/common/alice/clio',
        managed: true,
      },
    ]);
    renderDialog();
    await chooseRemoteHost(user);

    expect(screen.queryByText('Advanced installation')).not.toBeInTheDocument();
    expect(screen.queryByText('Install location')).not.toBeInTheDocument();
    expect(screen.queryByText('Remote platform')).not.toBeInTheDocument();
    expect(screen.queryByText(/select this host again in Infrastructure/u)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    await waitFor(() => expect(mocks.createInfrastructureTarget).toHaveBeenCalledOnce());
    expect(mocks.createInfrastructureTarget).toHaveBeenCalledWith(
      expect.objectContaining({ install_root: '/mnt/common/alice/clio' }),
    );
  });

  it('lets a hop be added before any computer is chosen, and validates only at Deploy', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));

    const addHop = await screen.findByRole('button', { name: 'Add hop' });
    expect(addHop).toBeEnabled();
    await user.click(addHop);
    expect(screen.getByRole('combobox', { name: 'Jump host 1' })).toBeVisible();
    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: 'Jump host 1' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    expect(await screen.findByText('Choose a computer for hop 2, or remove it.')).toBeVisible();
    expect(mocks.createInfrastructureTarget).not.toHaveBeenCalled();
  });

  it('shows a live stage list driven by transport events, with the installer’s own step', async () => {
    const user = userEvent.setup();
    mocks.runManagedServiceAction.mockResolvedValue(runningOperation);
    mocks.infrastructureOperation.mockResolvedValue(runningOperation);
    renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() => expect(mocks.runManagedServiceAction).toHaveBeenCalled());
    expect(stage('Connecting over SSH')).toHaveAttribute('data-state', 'done');
    // No prompt appeared, so authentication is not listed at all.
    expect(screen.queryByRole('listitem', { name: /^Authenticating:/u })).not.toBeInTheDocument();

    step('probe', 'running');
    expect(stage('Detecting platform')).toHaveAttribute('data-state', 'running');
    step('probe', 'done');
    step('install', 'running', 'Installing clio-agent[argonne]==0.9.4.17 from PyPI');
    expect(stage('Detecting platform')).toHaveAttribute('data-state', 'done');
    expect(stage(`Installing ${vocab.agent}`)).toHaveAttribute('data-state', 'running');
    expect(screen.getByText('Installing clio-agent[argonne]==0.9.4.17 from PyPI')).toBeVisible();
    step('install', 'running', 'Downloading clio-tui-linux-amd64 from clio-agent v0.9.4.17');
    expect(screen.getByText(/Downloading clio-tui-linux-amd64/u)).toBeVisible();
    expect(stage('Starting server')).toHaveAttribute('data-state', 'pending');
    expect(within(stage(`Installing ${vocab.agent}`)).getByText(/^\d+s$/u)).toBeVisible();

    // A running deployment locks what would change it.
    expect(screen.getByRole('radio', { name: /This computer/u })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Manage SSH hosts' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Add hop' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Deploying to homelab/u })).toBeDisabled();
  });

  it('lists Authenticating only when OpenSSH actually asks, and answers only real prompts', async () => {
    const user = userEvent.setup();
    mocks.attachInfrastructureSshTransport.mockResolvedValue({
      session_id: 'ssh-homelab',
      state: 'reauthentication_required',
      reused: false,
      output: '',
      prompt: null,
    });
    mocks.sshTransportStatus.mockResolvedValue({
      session_id: 'ssh-homelab',
      state: 'reauthentication_required',
      reused: true,
      output: "alice@10.0.0.102's password: ",
      prompt: {
        kind: 'password',
        text: "alice@10.0.0.102's password:",
        context: "alice@10.0.0.102's password:",
      },
    });
    renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    const answer = await screen.findByLabelText("alice@10.0.0.102's password:");
    expect(stage('Authenticating')).toHaveAttribute('data-state', 'running');
    await user.type(answer, 'hunter2{Enter}');
    expect(mocks.writeSshTransport).toHaveBeenCalledWith('ssh-homelab', 'hunter2\n');
  });

  it('Cancel interrupts the remote command, lets the agent clean up, then kills OpenSSH', async () => {
    const user = userEvent.setup();
    mocks.runManagedServiceAction.mockResolvedValue(runningOperation);
    mocks.infrastructureOperation.mockResolvedValue(runningOperation);
    let finishCancel: () => void = () => undefined;
    mocks.cancelInfrastructureOperation.mockReturnValue(
      new Promise((resolve) => {
        finishCancel = () => resolve({ ...runningOperation, state: 'cancelled' });
      }),
    );
    const onReady = renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    await waitFor(() => expect(mocks.runManagedServiceAction).toHaveBeenCalled());
    step('install', 'running', 'Creating the environment');

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    // Ctrl-C first, then the agent's cancel (which tears down over the open
    // session); OpenSSH is killed only after that finishes.
    expect(mocks.writeSshTransport).toHaveBeenCalledWith('ssh-homelab', '\u0003');
    await waitFor(() =>
      expect(mocks.cancelInfrastructureOperation).toHaveBeenCalledWith('operation-1'),
    );
    expect(mocks.cancelSshTransport).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled();
    expect(stage(`Installing ${vocab.agent}`)).toHaveAttribute('data-state', 'cancelled');
    step('teardown', 'running');
    expect(stage('Cleaning up')).toHaveAttribute('data-state', 'running');
    step('teardown', 'done', 'Removed the install this deploy created (/home/a/.local/share/clio)');
    await act(async () => finishCancel());

    await waitFor(() => expect(mocks.cancelSshTransport).toHaveBeenCalledWith('ssh-homelab'));
    expect(stage('Cleaning up')).toHaveAttribute('data-state', 'done');
    expect(screen.getByText(/Removed the install this deploy created/u)).toBeVisible();
    expect(screen.queryByRole('button', { name: /Cancel/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deploy and connect' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Saved SSH host' })).toBeEnabled();
    expect(onReady).not.toHaveBeenCalled();
  });

  it('shows the running-CLIO check as its own stage with its outcome', async () => {
    const user = userEvent.setup();
    mocks.runManagedServiceAction.mockResolvedValue(runningOperation);
    mocks.infrastructureOperation.mockResolvedValue(runningOperation);
    renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    await waitFor(() => expect(mocks.runManagedServiceAction).toHaveBeenCalled());
    expect(
      screen.queryByRole('listitem', { name: /^Checking for a running/u }),
    ).not.toBeInTheDocument();

    step('probe', 'done');
    step('claim', 'running');
    step(
      'claim',
      'done',
      'Stopped an old CLIO (pid 1036897, /mnt/common/a/clio-ui-acceptance-0941)',
    );
    step('install', 'running', 'Installing clio-agent');

    expect(stage(`Checking for a running ${vocab.agent}`)).toHaveAttribute('data-state', 'done');
    expect(screen.getByText(/Stopped an old CLIO \(pid 1036897/u)).toBeVisible();
  });

  it('summarizes a failure in one line and keeps the cleaned log behind Details', async () => {
    const user = userEvent.setup();
    mocks.runManagedServiceAction.mockResolvedValue(runningOperation);
    mocks.infrastructureOperation.mockResolvedValue({
      ...runningOperation,
      state: 'failed',
      error: 'Installing clio-agent\nerror: No space left on device',
    });
    mocks.sshTransportLog.mockResolvedValue(
      '==> Installing clio-agent[argonne]==0.9.4.17 from PyPI\nerror: No space left on device',
    );
    renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    await waitFor(() => expect(mocks.runManagedServiceAction).toHaveBeenCalled());
    step('install', 'running', 'Installing clio-agent[argonne]==0.9.4.17 from PyPI');
    step('install', 'failed', 'error: No space left on device');

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText(`Installing ${vocab.agent} failed`)).toBeVisible();
    expect(within(alert).getByText('error: No space left on device')).toBeVisible();
    expect(stage(`Installing ${vocab.agent}`)).toHaveAttribute('data-state', 'failed');
    // The log is collapsed until asked for, and carries no escapes or markers.
    expect(within(alert).queryByText(/==> Installing/u)).not.toBeInTheDocument();
    await user.click(within(alert).getByRole('button', { name: 'Details' }));
    const log = await within(alert).findByText(/==> Installing clio-agent/u);
    expect(log.textContent).not.toContain(String.fromCharCode(0x1b));
    expect(log.textContent).not.toContain('__CLIO_');
  });

  it('reports a clear error when OpenSSH disconnects before authenticating (#1438)', async () => {
    const user = userEvent.setup();
    mocks.attachInfrastructureSshTransport.mockResolvedValue({
      session_id: 'ssh-homelab',
      state: 'disconnected',
      reused: false,
      output: 'Permission denied (publickey,password).',
      prompt: null,
    });
    mocks.sshTransportLog.mockResolvedValue(
      'alice@10.0.0.102: Permission denied (publickey,password).',
    );
    renderDialog();
    await chooseRemoteHost(user);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    expect(await screen.findByText(/disconnected from homelab/u)).toBeVisible();
    expect(screen.getByText('Connecting over SSH failed')).toBeVisible();
    expect(mocks.sshTransportStatus).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
  });

  it('never sends a null key file or install root for a host left at defaults (#1438)', async () => {
    const user = userEvent.setup();
    renderDialog();
    mocks.listSshProfiles.mockResolvedValue([
      {
        name: 'delta',
        hostname: 'delta.example.edu',
        user: 'alice',
        port: 22,
        jump_hosts: [],
        identity_file: null,
        install_root: null,
        platform: 'linux',
        managed: false,
      },
    ]);

    await chooseRemoteHost(user, /delta/u);
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() => expect(mocks.createInfrastructureTarget).toHaveBeenCalledOnce());
    const [[sentDefinition]] = mocks.createInfrastructureTarget.mock.calls;
    expect(sentDefinition.install_root).toBe('');
    expect(sentDefinition.ssh.identity_file).toBe('');
  });

  it('opens a hosts manager from the gear that stays open and toggles visibility at once', async () => {
    const user = userEvent.setup();
    let finishHide: () => void = () => undefined;
    mocks.setSshProfileHidden.mockReturnValue(
      new Promise<void>((resolve) => {
        finishHide = resolve;
      }),
    );
    mocks.listAllSshProfiles.mockResolvedValue([
      { name: 'homelab', label: 'homelab', hostname: '10.0.0.102', managed: false, hidden: false },
    ]);
    renderDialog();
    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(screen.getByRole('button', { name: 'Manage SSH hosts' }));

    const manager = await screen.findByRole('dialog', { name: 'Manage SSH hosts' });
    await user.click(await within(manager).findByRole('button', { name: 'Hide homelab' }));

    // Optimistic: the row flips before the preference write finishes.
    expect(within(manager).getByRole('button', { name: 'Show homelab' })).toBeEnabled();
    expect(within(manager).getByText('Hidden')).toBeVisible();
    await act(async () => finishHide());
    expect(screen.getByRole('dialog', { name: 'Manage SSH hosts' })).toBeVisible();
    expect(mocks.setSshProfileHidden).toHaveBeenCalledWith('homelab', true);
    // Nothing was re-listed for a visibility change.
    expect(mocks.listAllSshProfiles).toHaveBeenCalledTimes(1);
  });
});
