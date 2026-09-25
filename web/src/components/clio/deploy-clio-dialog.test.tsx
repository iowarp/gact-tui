import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';

const mocks = vi.hoisted(() => ({
  attachInfrastructureSshTransport: vi.fn(),
  createInfrastructureTarget: vi.fn(),
  updateInfrastructureTarget: vi.fn(),
  getManagedBackend: vi.fn(),
  infrastructureTargets: vi.fn(),
  managedServiceCatalog: vi.fn(),
  retryManagedBackend: vi.fn(),
  runManagedServiceAction: vi.fn(),
  setInfrastructureTransportState: vi.fn(),
  sshTransportStatus: vi.fn(),
  listSshProfiles: vi.fn(),
  listAllSshProfiles: vi.fn(),
  saveSshProfile: vi.fn(),
  deleteSshProfile: vi.fn(),
  setSshProfileHidden: vi.fn(),
  setSshProfileRoute: vi.fn(),
  waitForManagedBackend: vi.fn(),
}));

vi.mock('@/hooks/use-repository', () => ({
  useRepository: () => ({
    createInfrastructureTarget: mocks.createInfrastructureTarget,
    infrastructureTargets: mocks.infrastructureTargets,
    managedServiceCatalog: mocks.managedServiceCatalog,
    runManagedServiceAction: mocks.runManagedServiceAction,
    setInfrastructureTransportState: mocks.setInfrastructureTransportState,
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
  sshTransportStatus: mocks.sshTransportStatus,
  writeSshTransport: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));
vi.mock('@/tauri/managed-backend', () => ({
  getManagedBackend: mocks.getManagedBackend,
  retryManagedBackend: mocks.retryManagedBackend,
  waitForManagedBackend: mocks.waitForManagedBackend,
}));

import { DeployClioDialog } from './deploy-clio-dialog';

function renderDialog(onReady = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DeployClioDialog onReady={onReady} />
    </QueryClientProvider>,
  );
  return onReady;
}

beforeEach(() => {
  localStorage.clear();
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.getManagedBackend.mockReset();
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
  });
  mocks.runManagedServiceAction.mockResolvedValue({
    id: 'operation-1',
    service_id: 'clio_agent',
    target_id: 'target-homelab',
    action: 'install',
    state: 'succeeded',
    progress: 'Completed',
    logs: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });
  mocks.managedServiceCatalog.mockResolvedValue({
    facts: {},
    services: [
      {
        id: 'clio_agent',
        state: 'running',
        connection_url: 'http://127.0.0.1:64123',
      },
    ],
  });
});

afterEach(cleanup);

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
    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() =>
      expect(onReady).toHaveBeenCalledWith({
        endpoint: 'http://127.0.0.1:64123',
        label: vocab.agent,
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

  it('reads the destination node’s own install location — one source of truth, no duplicate field', async () => {
    const user = userEvent.setup();
    // Managed, so configuring it edits homelab itself rather than spinning
    // off a new computer (imported hosts stay read-only apart from visibility).
    mocks.listSshProfiles.mockResolvedValue([
      {
        name: 'homelab',
        hostname: '10.0.0.102',
        user: 'alice',
        port: 22,
        jump_hosts: [],
        platform: 'linux',
        managed: true,
      },
    ]);
    renderDialog();
    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByText('Advanced installation'));

    // No editable field at the dialog level: the destination has none set yet.
    expect(screen.queryByLabelText('Install location')).not.toBeInTheDocument();
    expect(screen.getByText("The remote user's home directory")).toBeVisible();

    // Configuring the destination node is the one place that sets it.
    await user.click(screen.getByRole('button', { name: 'Configure homelab' }));
    await user.click(screen.getByText('Advanced host settings'));
    await user.type(
      screen.getByLabelText(`${vocab.agent} install and runtime location`),
      '/mnt/common/alice/clio',
    );
    await user.click(screen.getByRole('button', { name: 'Save host' }));

    // The dialog-level section now shows the destination's own setting.
    await screen.findByText('/mnt/common/alice/clio');

    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() => expect(mocks.createInfrastructureTarget).toHaveBeenCalledOnce());
    expect(mocks.createInfrastructureTarget).toHaveBeenCalledWith({
      kind: 'ssh',
      label: 'homelab',
      install_root: '/mnt/common/alice/clio',
      ssh: expect.objectContaining({ profile: 'homelab', host: '10.0.0.102' }),
    });
    // Never a second, spun-off computer: the same one is still edited in place.
    expect(mocks.saveSshProfile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'homelab', replace_existing: true }),
    );
  });

  it('opens a hosts manager from the gear beside the SSH host label', async () => {
    const user = userEvent.setup();
    mocks.listAllSshProfiles.mockResolvedValue([
      { name: 'homelab', label: 'homelab', hostname: '10.0.0.102', managed: false, hidden: false },
    ]);
    renderDialog();
    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));

    await user.click(screen.getByRole('button', { name: 'Manage SSH hosts' }));

    expect(await screen.findByRole('dialog', { name: 'Manage SSH hosts' })).toBeVisible();
    expect(screen.getByText('homelab')).toBeVisible();
  });

  it('shows string errors returned by the desktop backend', async () => {
    const user = userEvent.setup();
    renderDialog();
    mocks.runManagedServiceAction.mockRejectedValue(
      new Error('Python 3.12 is required on the remote host.'),
    );

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    expect(await screen.findByText('Python 3.12 is required on the remote host.')).toBeVisible();
  });

  it('never sends a null key file or install root for a host left at defaults (#1438)', async () => {
    const user = userEvent.setup();
    renderDialog();
    // The desktop's Rust bridge round-trips every unset optional field as a
    // literal `null` (Option::None over Tauri IPC), not `undefined` — for
    // both a host with no private key and one left at the default install
    // location.
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

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /delta/u }));
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    await waitFor(() => expect(mocks.createInfrastructureTarget).toHaveBeenCalledOnce());
    expect(mocks.createInfrastructureTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        install_root: '',
        ssh: expect.objectContaining({ identity_file: '' }),
      }),
    );
    const [[sentDefinition]] = mocks.createInfrastructureTarget.mock.calls;
    expect(sentDefinition.ssh.identity_file).not.toBeNull();
    expect(sentDefinition.install_root).not.toBeNull();
  });

  it('reports a clear error when OpenSSH disconnects before authenticating, instead of a silent timeout (#1438)', async () => {
    const user = userEvent.setup();
    renderDialog();
    mocks.attachInfrastructureSshTransport.mockResolvedValue({
      session_id: 'ssh-homelab',
      state: 'disconnected',
      reused: false,
      output: 'Permission denied (publickey,password).',
    });

    await user.click(screen.getByRole('button', { name: `Deploy ${vocab.agent}` }));
    await user.click(screen.getByRole('radio', { name: /Remote host/u }));
    await user.click(await screen.findByRole('combobox', { name: 'Saved SSH host' }));
    await user.click(screen.getByRole('option', { name: /homelab/u }));
    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    expect(await screen.findByText(/disconnected from homelab/u)).toBeVisible();
    expect(mocks.sshTransportStatus).not.toHaveBeenCalled();
  });
});
