import { beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke }));
vi.mock('@/lib/transport/tauri-runtime', () => ({ inTauri: () => true }));

class ScriptedSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static last: ScriptedSocket | undefined;
  readyState = ScriptedSocket.CONNECTING;
  protocol = '';
  readonly sent: string[] = [];
  constructor(
    readonly url: URL,
    readonly protocols: string[],
  ) {
    super();
    ScriptedSocket.last = this;
  }
  send(data: string) {
    this.sent.push(data);
  }
  close() {}
}

Object.assign(globalThis, { WebSocket: ScriptedSocket });

const { attachInfrastructureSshTransport } = await import('./ssh-infrastructure-transport');

const target = {
  id: 'chpc-notch351',
  label: 'CHPC notch351',
  kind: 'ssh' as const,
  install_root: '',
  ssh: {
    profile: '',
    host: 'notch351',
    user: 'u1282901',
    port: 22,
    jump_hosts: ['u1282901@notchpeak2.chpc.utah.edu'],
    identity_file: '',
    platform: 'linux' as const,
  },
  transport_state: 'connected' as const,
  auto_reconnect: true,
  created_at: '2026-09-26T00:00:00Z',
  updated_at: '2026-09-26T00:00:00Z',
};

async function socketOpened(): Promise<ScriptedSocket> {
  await vi.waitFor(() => expect(ScriptedSocket.last).toBeDefined());
  return ScriptedSocket.last!;
}

beforeEach(() => {
  ScriptedSocket.last = undefined;
  native.invoke.mockReset();
  native.invoke.mockResolvedValue({
    session_id: 'ssh-utah',
    state: 'connected',
    reused: true,
    output: '',
  });
});

describe('Deploy attach through a hop (#1478)', () => {
  it("fails with the agent's reason, never a bare rejection", async () => {
    const attaching = attachInfrastructureSshTransport('http://127.0.0.1:18947', 'tok', {
      ...target,
      id: 'refused-target',
    });
    const socket = await socketOpened();
    socket.readyState = ScriptedSocket.OPEN;
    socket.protocol = 'clio.infrastructure.v2';
    socket.dispatchEvent(new Event('open'));
    socket.dispatchEvent(
      new CloseEvent('close', { code: 4401, reason: 'authentication_required' }),
    );

    await expect(attaching).rejects.toThrow(/did not accept this app's sign-in/u);
    await expect(attaching).rejects.not.toThrow(/rejected the SSH transport attachment/u);
  });

  it('attaches on the agent confirmation and does not treat it as a forward request', async () => {
    const attaching = attachInfrastructureSshTransport('http://127.0.0.1:18947', 'tok', target);
    const socket = await socketOpened();
    expect(socket.protocols.slice(0, 2)).toEqual([
      'clio.infrastructure.v2',
      'clio.infrastructure.v1',
    ]);
    socket.readyState = ScriptedSocket.OPEN;
    socket.protocol = 'clio.infrastructure.v2';
    socket.dispatchEvent(new Event('open'));
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'attached', target_id: target.id }),
      }),
    );

    await expect(attaching).resolves.toMatchObject({ state: 'connected' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(native.invoke).not.toHaveBeenCalledWith('ssh_transport_forward', expect.anything());
    expect(socket.sent).toEqual([]);
  });
});
