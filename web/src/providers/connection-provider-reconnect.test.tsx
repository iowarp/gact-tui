// Split out of connection-provider.test.tsx (#1528 review item 2, file-size
// ratchet): reconnect-time target rebuild/reuse/route-matching and the
// found-CLIO conflict pause, all reached through the same public
// `resolveConnection` entry point as the rest of that file's tests.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  inTauri: vi.fn(),
  read: vi.fn(),
  waitForManagedBackend: vi.fn(),
  attachInfrastructureSshTransport: vi.fn(),
  sshTransportStatus: vi.fn(),
  closeInfrastructureSshTransport: vi.fn(),
  recoverInfrastructureSshTransports: vi.fn(),
  finishInstallerInfrastructure: vi.fn(),
  createRepository: vi.fn(),
  infrastructureTargets: vi.fn(),
  createInfrastructureTarget: vi.fn(),
  setInfrastructureTransportState: vi.fn(),
  managedServiceCatalog: vi.fn(),
  runManagedServiceAction: vi.fn(),
  infrastructureOperation: vi.fn(),
}));

vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: mocks.inTauri }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue('desktop-test') }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn().mockResolvedValue(vi.fn()) }));
vi.mock('@/tauri/secure-credentials', () => ({
  readConnectionCredential: mocks.read,
  storeConnectionCredential: vi.fn(),
  deleteConnectionCredential: vi.fn(),
}));
vi.mock('@/tauri/managed-backend', () => ({
  waitForManagedBackend: mocks.waitForManagedBackend,
}));
vi.mock('@/lib/installer-infrastructure', () => ({
  finishInstallerInfrastructure: mocks.finishInstallerInfrastructure,
}));
vi.mock('@/tauri/ssh-infrastructure-transport', () => ({
  recoverInfrastructureSshTransports: mocks.recoverInfrastructureSshTransports,
  attachInfrastructureSshTransport: mocks.attachInfrastructureSshTransport,
  sshTransportStatus: mocks.sshTransportStatus,
  closeInfrastructureSshTransport: mocks.closeInfrastructureSshTransport,
}));
vi.mock('@/lib/connection', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/connection')>()),
  createRepository: mocks.createRepository,
}));

import { ConnectionProvider, useConnectionSettings } from './connection-provider';

function ConnectionState() {
  const context = useConnectionSettings();
  const { settings } = context;
  const [resolvedEndpoint, setResolvedEndpoint] = useState('not-resolved');
  const [resolvedTargetId, setResolvedTargetId] = useState('not-resolved');
  const [resolveError, setResolveError] = useState('none');
  return (
    <div>
      <output aria-label="resolved endpoint">{resolvedEndpoint}</output>
      <output aria-label="resolved target id">{resolvedTargetId}</output>
      <output aria-label="resolve error">{resolveError}</output>
      <button
        onClick={() =>
          void context
            .resolveConnection(settings)
            .then((resolved) => {
              setResolvedEndpoint(resolved.endpoint);
              setResolvedTargetId(resolved.infrastructure?.targetId ?? 'none');
              setResolveError('none');
            })
            .catch((error: unknown) => {
              setResolveError(error instanceof Error ? error.name : String(error));
            })
        }
        type="button"
      >
        Resolve active connection
      </button>
    </div>
  );
}

const aresRoute = {
  label: 'ares lab',
  installRoot: '',
  profile: 'ares',
  host: 'ares.cs.iit.edu',
  user: 'researcher',
  port: 22,
  jumpHosts: [],
  identityFile: '',
  platform: 'linux',
};

describe('connection provider reconnect (#1528)', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.inTauri.mockReset();
    mocks.read.mockReset();
    mocks.waitForManagedBackend.mockReset();
    mocks.finishInstallerInfrastructure.mockReset();
    mocks.recoverInfrastructureSshTransports.mockReset();
    mocks.attachInfrastructureSshTransport.mockReset();
    mocks.sshTransportStatus.mockReset();
    mocks.closeInfrastructureSshTransport.mockReset();
    mocks.createRepository.mockReset();
    mocks.infrastructureTargets.mockReset();
    mocks.createInfrastructureTarget.mockReset();
    mocks.setInfrastructureTransportState.mockReset();
    mocks.managedServiceCatalog.mockReset();
    mocks.runManagedServiceAction.mockReset();
    mocks.infrastructureOperation.mockReset();
    mocks.finishInstallerInfrastructure.mockResolvedValue(undefined);
    mocks.recoverInfrastructureSshTransports.mockResolvedValue(undefined);
    mocks.closeInfrastructureSshTransport.mockResolvedValue(undefined);
    mocks.setInfrastructureTransportState.mockResolvedValue(undefined);
    mocks.read.mockResolvedValue(undefined);
    mocks.inTauri.mockReturnValue(false);
    mocks.waitForManagedBackend.mockResolvedValue({
      url: 'http://127.0.0.1:17800',
      bearer_token: 'controller-token',
    });
    mocks.createRepository.mockReturnValue({
      infrastructureTargets: mocks.infrastructureTargets,
      createInfrastructureTarget: mocks.createInfrastructureTarget,
      setInfrastructureTransportState: mocks.setInfrastructureTransportState,
      managedServiceCatalog: mocks.managedServiceCatalog,
      runManagedServiceAction: mocks.runManagedServiceAction,
      infrastructureOperation: mocks.infrastructureOperation,
    });
  });

  afterEach(cleanup);

  function saveAresConnection(infrastructure: Record<string, unknown>) {
    localStorage.setItem(
      'clio.recent-connections',
      JSON.stringify([{ endpoint: 'http://127.0.0.1:43123', label: 'Ares lab', infrastructure }]),
    );
  }

  it('rebuilds a missing infrastructure target from its saved SSH route (#1528)', async () => {
    // Reproduces a desktop that never created -- or no longer has -- this
    // host's target record: a fresh install after an update, a second
    // computer, or a different local CLIO's store. The saved connection
    // still remembers the SSH route it was deployed from.
    saveAresConnection({ targetId: 'gone-target', serviceId: 'clio_agent', route: aresRoute });
    // This desktop's own store never held "gone-target".
    mocks.infrastructureTargets.mockResolvedValue([]);
    const rebuilt = {
      id: 'ares-lab-2',
      label: 'ares lab',
      kind: 'ssh',
      transport_state: 'state_unknown',
      auto_reconnect: true,
      install_root: '',
      ssh: { profile: 'ares' },
    };
    mocks.createInfrastructureTarget.mockResolvedValue(rebuilt);
    mocks.attachInfrastructureSshTransport.mockResolvedValue({
      session_id: 'ssh-ares',
      state: 'connected',
      reused: false,
      output: '',
    });
    // A freshly (re)built target has no service record yet -- the real
    // server's catalog can only report `not_installed` for it (runtime.py's
    // catalog derives state from a stored ServiceRecord, and none exists).
    // Reaching "running" requires the claim step below to run first, exactly
    // like a fresh "Deploy and connect" (#1528 review item 1).
    mocks.runManagedServiceAction.mockResolvedValue({
      id: 'op-claim-ares',
      action: 'install',
      state: 'succeeded',
    });
    mocks.managedServiceCatalog.mockResolvedValue({
      facts: {},
      services: [{ id: 'clio_agent', state: 'running', connection_url: 'http://127.0.0.1:43123' }],
    });

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resolve active connection' }));

    await waitFor(() => {
      expect(screen.getByLabelText('resolved endpoint')).toHaveTextContent(
        'http://127.0.0.1:43123',
      );
    });
    expect(screen.getByLabelText('resolve error')).toHaveTextContent('none');
    // The rebuilt id -- not the stale, gone one -- is what gets remembered.
    expect(screen.getByLabelText('resolved target id')).toHaveTextContent('ares-lab-2');
    expect(mocks.createInfrastructureTarget).toHaveBeenCalledWith({
      kind: 'ssh',
      label: 'ares lab',
      install_root: '',
      ssh: {
        profile: 'ares',
        host: 'ares.cs.iit.edu',
        user: 'researcher',
        port: 22,
        jump_hosts: [],
        identity_file: '',
        platform: 'linux',
      },
    });
    // The claim step ran against the rebuilt target -- the same path
    // "Deploy and connect" uses -- before the catalog was ever trusted.
    expect(mocks.runManagedServiceAction).toHaveBeenCalledWith('clio_agent', {
      target_id: 'ares-lab-2',
      action: 'install',
      variant_id: 'released',
      configuration: { port: '17800', desktop_id: 'desktop-test', keep_running: 'false' },
    });
    expect(mocks.setInfrastructureTransportState).toHaveBeenCalledWith('ares-lab-2', 'connected');
  });

  it('reuses an existing target matching the saved route instead of minting a duplicate (#1528)', async () => {
    // A second, unrelated target already exists for this exact host under a
    // different id (e.g. renamed, or created by a different flow) -- the
    // rebuild path must find and reuse it, mirroring `registerTarget`'s own
    // dedup check for a fresh deploy, instead of creating a second record for
    // the same computer.
    saveAresConnection({ targetId: 'gone-target', serviceId: 'clio_agent', route: aresRoute });
    const existingForSameHost = {
      id: 'ares-already-here',
      label: 'ares lab (renamed)',
      kind: 'ssh',
      transport_state: 'state_unknown',
      auto_reconnect: true,
      install_root: '',
      ssh: {
        profile: '',
        host: 'ares.cs.iit.edu',
        user: 'researcher',
        port: 22,
        jump_hosts: [],
      },
    };
    mocks.infrastructureTargets.mockResolvedValue([existingForSameHost]);
    mocks.attachInfrastructureSshTransport.mockResolvedValue({
      session_id: 'ssh-ares',
      state: 'connected',
      reused: true,
      output: '',
    });
    mocks.runManagedServiceAction.mockResolvedValue({
      id: 'op-claim-ares',
      action: 'install',
      state: 'succeeded',
    });
    mocks.managedServiceCatalog.mockResolvedValue({
      facts: {},
      services: [{ id: 'clio_agent', state: 'running', connection_url: 'http://127.0.0.1:43123' }],
    });

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resolve active connection' }));

    await waitFor(() => {
      expect(screen.getByLabelText('resolved target id')).toHaveTextContent('ares-already-here');
    });
    expect(mocks.createInfrastructureTarget).not.toHaveBeenCalled();
    expect(mocks.runManagedServiceAction).toHaveBeenCalledWith('clio_agent', {
      target_id: 'ares-already-here',
      action: 'install',
      variant_id: 'released',
      configuration: { port: '17800', desktop_id: 'desktop-test', keep_running: 'false' },
    });
  });

  it('treats a found-by-id target on a different host as missing rather than attaching to it (#1528)', async () => {
    // Target ids are label slugs, not unique across computers (store.py's
    // `_next_target_id`) -- a stale or coincidentally reused id must never
    // let this saved connection attach to (or hand its saved bearer token
    // to) an unrelated machine.
    saveAresConnection({
      targetId: 'ares-lab',
      serviceId: 'clio_agent',
      route: { ...aresRoute, profile: '' },
    });
    // Same id, but a DIFFERENT host -- reused by another deploy, or a stale
    // record from before an uninstall/reinstall under the same label slug.
    const wrongHost = {
      id: 'ares-lab',
      label: 'ares lab',
      kind: 'ssh',
      transport_state: 'state_unknown',
      auto_reconnect: true,
      install_root: '',
      ssh: {
        profile: '',
        host: 'a-totally-different-host.example',
        user: 'someone-else',
        port: 22,
        jump_hosts: [],
      },
    };
    mocks.infrastructureTargets.mockResolvedValue([wrongHost]);
    const rebuilt = {
      id: 'ares-lab-2',
      label: 'ares lab',
      kind: 'ssh',
      transport_state: 'state_unknown',
      auto_reconnect: true,
      install_root: '',
      ssh: { profile: '', host: 'ares.cs.iit.edu', user: 'researcher', port: 22, jump_hosts: [] },
    };
    mocks.createInfrastructureTarget.mockResolvedValue(rebuilt);
    mocks.attachInfrastructureSshTransport.mockResolvedValue({
      session_id: 'ssh-ares',
      state: 'connected',
      reused: false,
      output: '',
    });
    mocks.runManagedServiceAction.mockResolvedValue({
      id: 'op-claim-ares',
      action: 'install',
      state: 'succeeded',
    });
    mocks.managedServiceCatalog.mockResolvedValue({
      facts: {},
      services: [{ id: 'clio_agent', state: 'running', connection_url: 'http://127.0.0.1:43123' }],
    });

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resolve active connection' }));

    await waitFor(() => {
      expect(screen.getByLabelText('resolved target id')).toHaveTextContent('ares-lab-2');
    });
    // Never attached to the wrong-host target under the reused id.
    expect(mocks.attachInfrastructureSshTransport).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ id: 'ares-lab', ssh: wrongHost.ssh }),
    );
    expect(mocks.createInfrastructureTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        ssh: expect.objectContaining({ host: 'ares.cs.iit.edu', user: 'researcher' }),
      }),
    );
  });

  it('pauses on a Connect/Replace dialog when the claim on a rebuilt target finds a running CLIO (#1528)', async () => {
    saveAresConnection({ targetId: 'gone-target', serviceId: 'clio_agent', route: aresRoute });
    mocks.infrastructureTargets.mockResolvedValue([]);
    const rebuilt = {
      id: 'ares-lab-2',
      label: 'ares lab',
      kind: 'ssh',
      transport_state: 'state_unknown',
      auto_reconnect: true,
      install_root: '',
      ssh: { profile: 'ares' },
    };
    mocks.createInfrastructureTarget.mockResolvedValue(rebuilt);
    mocks.attachInfrastructureSshTransport.mockResolvedValue({
      session_id: 'ssh-ares',
      state: 'connected',
      reused: false,
      output: '',
    });
    mocks.runManagedServiceAction
      .mockResolvedValueOnce({
        id: 'op-claim-1',
        action: 'install',
        state: 'failed',
        error: 'clio_deploy_version_conflict',
        conflict: { installed_version: '0.9.3', pid: '4821', health: 'healthy' },
      })
      .mockResolvedValueOnce({ id: 'op-claim-2', action: 'install', state: 'succeeded' });
    mocks.managedServiceCatalog.mockResolvedValue({
      facts: {},
      services: [{ id: 'clio_agent', state: 'running', connection_url: 'http://127.0.0.1:43123' }],
    });

    render(
      <ConnectionProvider>
        <ConnectionState />
      </ConnectionProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Resolve active connection' }));

    const dialog = await screen.findByRole('alert');
    expect(dialog).toHaveTextContent('0.9.3');
    expect(dialog).toHaveTextContent('4821');
    expect(dialog).toHaveAttribute('aria-live', 'assertive');

    fireEvent.click(screen.getByRole('button', { name: /Reconnect to the running/u }));

    await waitFor(() => {
      expect(screen.getByLabelText('resolved target id')).toHaveTextContent('ares-lab-2');
    });
    expect(mocks.runManagedServiceAction).toHaveBeenLastCalledWith('clio_agent', {
      target_id: 'ares-lab-2',
      action: 'install',
      variant_id: 'released',
      configuration: {
        port: '17800',
        desktop_id: 'desktop-test',
        keep_running: 'false',
        on_conflict: 'connect',
        conflict_pid: '4821',
      },
    });
  });
});
