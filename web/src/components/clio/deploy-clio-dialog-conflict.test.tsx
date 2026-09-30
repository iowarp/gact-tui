/**
 * A healthy CLIO the claim step finds under a different install root or
 * version is never silently stopped: the dialog asks "Connect to the
 * running CLIO (vX)" or "Replace it" (#1528). Split out from
 * `deploy-clio-dialog.test.tsx` (own suite, own fixtures) to keep that file
 * under the CLIO-owned file-size ratchet.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
  invoke: vi.fn(),
  setSshProfileHidden: vi.fn(),
  setSshProfileRoute: vi.fn(),
  waitForManagedBackend: vi.fn(),
  writeSshTransport: vi.fn(),
}));

/** Desktop event handlers the dialog registered, by event name. */
const handlers = new Map<string, (event: { payload: unknown }) => void>();

/** A `gact_http` bridge that answers the health check with `status`. */
function nativeHealth(status: number) {
  return async (command: string) => {
    if (command !== 'gact_http') throw new Error(`unexpected native command ${command}`);
    return {
      status,
      status_text: status === 200 ? 'OK' : 'Bad Gateway',
      headers: {},
      body: status === 200 ? '{"status":"ok"}' : 'bad gateway',
    };
  };
}

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
// The native HTTP bridge (`gact_http`) that carries the health check.
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
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
  // The remote CLIO's own answer through the tunnel, via the native bridge.
  mocks.invoke.mockReset().mockImplementation(nativeHealth(200));
  // The WebView's fetch is never the path: it is CORS-blocked in the desktop.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
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

/**
 * The exact conflict sentence the dialog renders (spread over several
 * JSX-expression text nodes, so an exact string match against one element's
 * concatenated direct-child text -- not the library's node-splitting -- is
 * what has to survive; `vocab.agent` is whatever this build's brand names
 * the agent, never hardcoded).
 */
function isConflictText(element: Element | null): boolean {
  return element?.textContent === `${vocab.agent} 0.9.4.1 is already running on homelab (pid 321).`;
}

describe('DeployClioDialog found-CLIO conflict', () => {
  it('asks "Connect" or "Replace" when claiming the port finds another healthy CLIO, and continues on Connect', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    await chooseRemoteHost(user);
    mocks.runManagedServiceAction
      .mockResolvedValueOnce({ ...runningOperation, state: 'running' })
      .mockResolvedValueOnce({ ...runningOperation, id: 'operation-2', state: 'succeeded' });
    mocks.infrastructureOperation.mockResolvedValueOnce({
      ...runningOperation,
      state: 'failed',
      error: 'clio_deploy_version_conflict',
      conflict: { installed_version: '0.9.4.1', pid: '321', health: 'healthy' },
    });

    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    // The found CLIO is neither stopped nor installed over -- the person
    // decides, never clio itself. A real (short) poll delay separates the
    // claim from the conflict surfacing, so this outlasts the default 1s.
    expect(
      await screen.findByText((_, element) => isConflictText(element), {}, { timeout: 5000 }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: /Deploying to homelab/u })).toBeDisabled();

    await user.click(
      screen.getByRole('button', { name: `Connect to the running ${vocab.agent} (0.9.4.1)` }),
    );

    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(mocks.runManagedServiceAction).toHaveBeenLastCalledWith('clio_agent', {
      target_id: 'target-homelab',
      action: 'install',
      variant_id: 'released',
      configuration: { on_conflict: 'connect' },
    });
  });

  it('re-issues the install with "replace" when the person chooses to replace a found CLIO', async () => {
    const user = userEvent.setup();
    const onReady = renderDialog();
    await chooseRemoteHost(user);
    mocks.runManagedServiceAction
      .mockResolvedValueOnce({ ...runningOperation, state: 'running' })
      // Terminal on its own first answer: no further polling, so nothing is
      // left running past this test (a "running" default here would keep
      // `waitForOperation` polling forever and leak into the next test).
      .mockResolvedValueOnce({ ...runningOperation, id: 'operation-2', state: 'succeeded' });
    mocks.infrastructureOperation.mockResolvedValueOnce({
      ...runningOperation,
      state: 'failed',
      error: 'clio_deploy_version_conflict',
      conflict: { installed_version: '0.9.4.1', pid: '321', health: 'healthy' },
    });

    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));
    await screen.findByText((_, element) => isConflictText(element), {}, { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Replace it' }));

    await waitFor(() => expect(onReady).toHaveBeenCalled());
    expect(mocks.runManagedServiceAction).toHaveBeenLastCalledWith('clio_agent', {
      target_id: 'target-homelab',
      action: 'install',
      variant_id: 'released',
      configuration: { on_conflict: 'replace' },
    });
  });

  it('offers only Replace, with "isn\'t answering" wording, for an unresponsive found CLIO (#1528 review)', async () => {
    const user = userEvent.setup();
    renderDialog();
    await chooseRemoteHost(user);
    mocks.runManagedServiceAction.mockResolvedValueOnce({ ...runningOperation, state: 'running' });
    mocks.infrastructureOperation.mockResolvedValueOnce({
      ...runningOperation,
      state: 'failed',
      error: 'clio_deploy_version_conflict',
      conflict: { installed_version: 'unknown', pid: '321', health: 'unresponsive' },
    });

    await user.click(screen.getByRole('button', { name: 'Deploy and connect' }));

    expect(
      await screen.findByText(
        (_, element) =>
          element?.textContent ===
          `${vocab.agent} on homelab isn't answering (pid 321) — Replace it?`,
        {},
        { timeout: 8000 },
      ),
    ).toBeVisible();
    // Connecting to something that never answered makes no sense: only
    // Replace is offered, never Connect (#1528 review).
    expect(
      screen.queryByRole('button', { name: /Connect to the running/u }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace it' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Replace it' }));

    await waitFor(() =>
      expect(mocks.runManagedServiceAction).toHaveBeenLastCalledWith('clio_agent', {
        target_id: 'target-homelab',
        action: 'install',
        variant_id: 'released',
        configuration: { on_conflict: 'replace' },
      }),
    );
  }, 15_000);
});
