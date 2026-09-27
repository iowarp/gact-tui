import { describe, expect, it } from 'vitest';

class ScriptedSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  readyState = ScriptedSocket.CONNECTING;
  protocol = '';
  constructor(
    readonly url: URL,
    readonly protocols: string[],
  ) {
    super();
  }
  open(protocol: string) {
    this.readyState = ScriptedSocket.OPEN;
    this.protocol = protocol;
    this.dispatchEvent(new Event('open'));
  }
  frame(data: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(data) }));
  }
  closeWith(code: number, reason: string) {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close', { code, reason }));
  }
  failHandshake() {
    this.readyState = 3;
    this.dispatchEvent(new Event('error'));
    this.dispatchEvent(new CloseEvent('close', { code: 1006, reason: '' }));
  }
}

Object.assign(globalThis, { WebSocket: ScriptedSocket });

const {
  HANDSHAKE_FAILED_MESSAGE,
  infrastructureSocket,
  transportRefusalMessage,
  waitForAttachment,
} = await import('./ssh-transport-attachment');

function socket(): ScriptedSocket {
  return infrastructureSocket(
    'http://127.0.0.1:18947',
    'tok',
    'chpc-notch351',
  ) as unknown as ScriptedSocket;
}

describe('SSH transport attachment (#1478)', () => {
  it('offers v2 before v1 and carries the bearer as its own subprotocol', () => {
    const opened = socket();
    expect(String(opened.url)).toBe(
      'ws://127.0.0.1:18947/v1/infrastructure/targets/chpc-notch351/transport',
    );
    expect(opened.protocols).toEqual([
      'clio.infrastructure.v2',
      'clio.infrastructure.v1',
      'clio-bearer.dG9r',
    ]);
  });

  it('shows the agent refusal reason instead of a bare "rejected"', async () => {
    const opened = socket();
    const attached = waitForAttachment(opened as unknown as WebSocket);
    opened.open('clio.infrastructure.v2');
    opened.closeWith(4401, 'authentication_required');

    await expect(attached).rejects.toThrow(
      transportRefusalMessage(4401, 'authentication_required'),
    );
    await expect(attached).rejects.not.toThrow(/rejected the SSH transport attachment/u);
  });

  it.each([
    [4404, 'target_not_found', /no longer has this SSH host saved/u],
    [4403, 'origin_not_allowed', /only from this app's own window/u],
    [4409, 'target_not_ssh', /only to an SSH host/u],
    [4500, 'something_new', /code 4500: something_new/u],
  ])('maps close %i %s to plain language', async (code, reason, text) => {
    const opened = socket();
    const attached = waitForAttachment(opened as unknown as WebSocket);
    opened.open('clio.infrastructure.v2');
    opened.closeWith(code, reason);
    await expect(attached).rejects.toThrow(text);
  });

  it('treats the v2 handshake alone as not yet attached', async () => {
    const opened = socket();
    let settled = false;
    const attached = waitForAttachment(opened as unknown as WebSocket).then(() => {
      settled = true;
    });
    opened.open('clio.infrastructure.v2');
    await Promise.resolve();
    expect(settled).toBe(false);

    opened.frame({ type: 'attached', target_id: 'chpc-notch351' });
    await attached;
    expect(settled).toBe(true);
  });

  it('accepts a v1 agent on the handshake, and says an old agent gives no reason', async () => {
    const legacy = socket();
    const attached = waitForAttachment(legacy as unknown as WebSocket);
    legacy.open('clio.infrastructure.v1');
    await expect(attached).resolves.toBeUndefined();

    const refused = socket();
    const refusal = waitForAttachment(refused as unknown as WebSocket);
    refused.failHandshake();
    await expect(refusal).rejects.toThrow(HANDSHAKE_FAILED_MESSAGE);
  });
});
