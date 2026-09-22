import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));

class FakeWebSocket {
  static readonly OPEN = 1;
  readonly readyState = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {}

  addEventListener(name: string, listener: (event: MessageEvent) => void) {
    const current = this.listeners.get(name) ?? [];
    current.push(listener);
    this.listeners.set(name, current);
  }

  removeEventListener(name: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(
      name,
      (this.listeners.get(name) ?? []).filter((candidate) => candidate !== listener),
    );
  }

  send() {}

  close() {}
}

Object.assign(globalThis, { WebSocket: FakeWebSocket });

import { recoverInfrastructureSshTransports } from './ssh-infrastructure-transport';

const target = {
  id: 'homelab-recovery',
  label: 'Homelab',
  kind: 'ssh' as const,
  install_root: '',
  ssh: {
    profile: 'homelab',
    host: '10.0.0.102',
    user: 'alice',
    port: 22,
    jump_hosts: [],
    identity_file: '',
    platform: 'linux' as const,
  },
  transport_state: 'state_unknown' as const,
  auto_reconnect: true,
  created_at: '2026-09-21T00:00:00Z',
  updated_at: '2026-09-21T00:00:00Z',
};

function repository() {
  return {
    infrastructureTargets: vi.fn().mockResolvedValue([target]),
    externalServiceConnections: vi.fn().mockResolvedValue([]),
    checkExternalServiceConnection: vi.fn().mockResolvedValue(undefined),
    setInfrastructureTransportState: vi.fn().mockResolvedValue(undefined),
    managedServiceCatalog: vi.fn().mockResolvedValue({ facts: {}, services: [] }),
  };
}

beforeEach(() => native.invoke.mockReset());
afterEach(() => vi.useRealTimers());

describe('SSH infrastructure recovery', () => {
  it('reattaches silently and reconciles services without replaying lifecycle actions', async () => {
    native.invoke.mockImplementation(async (command: string) => ({
      session_id: 'ssh-recovery',
      state: 'connected',
      reused: command === 'ssh_transport_status',
      output: '',
    }));
    const repo = repository();

    await recoverInfrastructureSshTransports(repo as never, 'http://127.0.0.1:17800', 'token');

    expect(native.invoke).toHaveBeenCalledWith('ssh_transport_open', {
      request: expect.objectContaining({ interactive: false, target_id: target.id }),
    });
    expect(repo.managedServiceCatalog).toHaveBeenCalledWith(target.id);
    expect(repo.setInfrastructureTransportState).toHaveBeenLastCalledWith(target.id, 'connected');
  });

  it('reports reauthentication instead of retrying destructive work', async () => {
    const reauthTarget = { ...target, id: 'utah-recovery', label: 'Utah' };
    const repo = {
      ...repository(),
      infrastructureTargets: vi.fn().mockResolvedValue([reauthTarget]),
    };
    native.invoke.mockResolvedValue({
      session_id: 'ssh-utah',
      state: 'reauthentication_required',
      reused: false,
      output: 'Batch authentication was refused',
    });

    await recoverInfrastructureSshTransports(repo as never, 'http://127.0.0.1:17800', 'token');

    expect(repo.managedServiceCatalog).not.toHaveBeenCalled();
    expect(repo.setInfrastructureTransportState).toHaveBeenLastCalledWith(
      reauthTarget.id,
      'reauthentication_required',
    );
  });
});
