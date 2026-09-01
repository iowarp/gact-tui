import { describe, expect, it } from 'vitest';
import { TauriClioTransport, type TauriBridge } from './tauri-transport';

class FakeBridge implements TauriBridge {
  public calls: Array<{ command: string; args?: Record<string, unknown> }> = [];
  private handler?: (event: { payload: unknown }) => void;

  public async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    this.calls.push({ command, args });
    if (command === 'gact_http') {
      return {
        status: 200,
        status_text: 'OK',
        headers: { 'content-type': 'application/json' },
        body: '{"ok":true}',
      } as T;
    }
    if (command === 'gact_sse_open') {
      queueMicrotask(() => {
        this.handler?.({
          payload: {
            client_id: 'test-client',
            message: {
              kind: 'event',
              id: '44',
              data: JSON.stringify({
                protocol_version: '0.3',
                type: 'stream.live',
                occurred_at: '2026-08-22T12:00:00Z',
                scope: { connection_id: 'local' },
                payload: {},
              }),
            },
          },
        });
      });
      return 7 as T;
    }
    return undefined as T;
  }

  public async listen<T>(
    _event: string,
    handler: (event: { payload: T }) => void,
  ): Promise<() => void> {
    this.handler = handler as (event: { payload: unknown }) => void;
    return () => {
      this.handler = undefined;
    };
  }
}

class TextBridge extends FakeBridge {
  public override async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (command === 'gact_http') {
      this.calls.push({ command, args });
      return {
        status: 200,
        status_text: 'OK',
        headers: { 'content-type': 'text/plain' },
        body: '# Blueprint\n',
      } as T;
    }
    return super.invoke(command, args);
  }
}

class ErrorBridge extends FakeBridge {
  public override async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (command === 'gact_http') {
      this.calls.push({ command, args });
      return {
        status: 409,
        status_text: 'Conflict',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          error: {
            error: 'custody_not_cas',
            message: 'Fetch this artifact through its workspace.',
            details: { fetch_via: '/v1/workspaces/ws_1/files/read?path=answer.ts' },
          },
        }),
      } as T;
    }
    return super.invoke(command, args);
  }
}

class BinaryBridge extends FakeBridge {
  public override async invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
    if (command === 'gact_http') {
      this.calls.push({ command, args });
      return {
        status: 200,
        status_text: 'OK',
        headers: { 'content-type': 'image/png' },
        body: 'iVBORwD/',
        body_encoding: 'base64',
      } as T;
    }
    return super.invoke(command, args);
  }
}

describe('TauriClioTransport', () => {
  it('routes negotiated REST through the Rust bridge', async () => {
    const bridge = new FakeBridge();
    const transport = new TauriClioTransport({
      endpoint: 'http://127.0.0.1:8787',
      token: 'secret',
      bridge,
    });

    await expect(
      transport.request({ method: 'GET', path: '/v1/capabilities', decode: (value) => value }),
    ).resolves.toEqual({ ok: true });

    const request = bridge.calls[0]?.args?.req as {
      headers: Record<string, string>;
      url: string;
    };
    expect(request.url).toBe('http://127.0.0.1:8787/v1/capabilities');
    expect(request.headers.Authorization).toBe('Bearer secret');
    expect(request.headers['X-GACT-Version']).toBe('0.3');
    expect(request.headers['X-A2UI-Version']).toBe('0.9.1');
  });

  it('preserves text responses from the Rust bridge', async () => {
    const transport = new TauriClioTransport({
      endpoint: 'http://127.0.0.1:8787',
      bridge: new TextBridge(),
    });

    await expect(
      transport.request({
        method: 'GET',
        path: '/v1/agent-blueprints/base/files/read?path=AGENT.md',
        responseType: 'text',
        decode: (value) => String(value),
      }),
    ).resolves.toBe('# Blueprint\n');
  });

  it('preserves structured errors from the Rust bridge for typed recovery', async () => {
    const transport = new TauriClioTransport({
      endpoint: 'http://127.0.0.1:8787',
      bridge: new ErrorBridge(),
    });

    const request = transport.request({
      method: 'GET',
      path: '/v1/artifacts/art_1/bytes',
      responseType: 'text',
      decode: String,
    });

    await expect(request).rejects.toMatchObject({
      status: 409,
      code: 'custody_not_cas',
      details: { fetch_via: '/v1/workspaces/ws_1/files/read?path=answer.ts' },
    });
  });

  it('decodes native base64 bodies into the original binary bytes', async () => {
    const transport = new TauriClioTransport({
      endpoint: 'http://127.0.0.1:8787',
      bridge: new BinaryBridge(),
    });

    await expect(
      transport.request({
        method: 'GET',
        path: '/v1/artifacts/plot/bytes',
        responseType: 'bytes',
        decode: (value) => value,
      }),
    ).resolves.toEqual(new Uint8Array([137, 80, 78, 71, 0, 255]));
  });

  it('turns the keyed Rust SSE event into the shared transport frame', async () => {
    const bridge = new FakeBridge();
    const transport = new TauriClioTransport({
      endpoint: 'http://127.0.0.1:8787',
      bridge,
      clientId: () => 'test-client',
      now: () => '2026-08-22T12:00:01Z',
    });
    const iterator = transport
      .stream({ connection_id: 'local', session_id: 'sess_1' }, '43')
      [Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: {
        cursor: '44',
        eventName: 'stream.live',
        data: {
          protocol_version: '0.3',
          type: 'stream.live',
          occurred_at: '2026-08-22T12:00:00Z',
          scope: { connection_id: 'local' },
          payload: {},
        },
        receivedAt: '2026-08-22T12:00:01Z',
      },
    });
    await iterator.return?.();

    const open = bridge.calls.find((call) => call.command === 'gact_sse_open');
    const headers = (open?.args?.headers ?? {}) as Record<string, string>;
    expect(headers['Last-Event-ID']).toBe('43');
    expect(bridge.calls.some((call) => call.command === 'gact_sse_close')).toBe(true);
  });
});
