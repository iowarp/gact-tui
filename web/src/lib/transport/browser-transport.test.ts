import { describe, expect, it, vi } from 'vitest';
import { BrowserClioTransport } from './browser-transport';

describe('BrowserClioTransport', () => {
  it('decodes an empty 204 response without attempting JSON parsing', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));
    const transport = new BrowserClioTransport({ endpoint: 'http://clio.test:8787', fetcher });
    const decode = vi.fn(() => undefined);

    await expect(
      transport.request({ method: 'POST', path: '/v1/sessions/sess_1/cancel', decode }),
    ).resolves.toBeUndefined();

    expect(decode).toHaveBeenCalledWith(undefined);
    expect(fetcher).toHaveBeenCalledOnce();
    const [, options] = fetcher.mock.calls[0] ?? [];
    expect(options?.method).toBe('POST');
    expect(new Headers(options?.headers).get('X-GACT-Version')).toBe('0.3');
  });

  it('returns authoritative text responses without attempting JSON parsing', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('export const answer = 42\n', { status: 200 }));
    const transport = new BrowserClioTransport({ endpoint: 'http://clio.test:8787', fetcher });

    await expect(
      transport.request({
        method: 'GET',
        path: '/v1/workspaces/ws_1/files/read?path=answer.ts',
        responseType: 'text',
        decode: (value) => String(value),
      }),
    ).resolves.toBe('export const answer = 42\n');
  });

  it('preserves binary response bytes without decoding them as text', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 0, 255]);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes, { status: 200 }));
    const transport = new BrowserClioTransport({ endpoint: 'http://clio.test:8787', fetcher });

    await expect(
      transport.request({
        method: 'GET',
        path: '/v1/artifacts/plot/bytes',
        responseType: 'bytes',
        decode: (value) => value,
      }),
    ).resolves.toEqual(bytes);
  });

  it('preserves structured server errors for typed recovery', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          error: {
            error: 'custody_not_cas',
            message: 'Fetch this artifact through its workspace.',
            details: { fetch_via: '/v1/workspaces/ws_1/files/read?path=answer.ts' },
          },
        },
        { status: 409, statusText: 'Conflict' },
      ),
    );
    const transport = new BrowserClioTransport({ endpoint: 'http://clio.test:8787', fetcher });

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

  it('preserves FastAPI detail-wrapped errors for typed recovery', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(
        {
          detail: {
            error: {
              error: 'not_found',
              message: 'MCP App instance not found',
              recoverable: false,
            },
          },
        },
        { status: 404, statusText: 'Not Found' },
      ),
    );
    const transport = new BrowserClioTransport({ endpoint: 'http://clio.test:8787', fetcher });

    const request = transport.request({
      method: 'GET',
      path: '/v1/sessions/sess_1/mcp-apps/app_1?data_ref=opaque-ref',
      decode: String,
    });

    await expect(request).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'MCP App instance not found',
    });
  });

  it('cancels the response reader when a session stream is aborted', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => undefined),
      cancel,
    });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 }));
    const transport = new BrowserClioTransport({ endpoint: 'http://clio.test:8787', fetcher });
    const controller = new AbortController();
    const iterator = transport
      .stream({ connection_id: 'active', session_id: 'sess_1' }, undefined, controller.signal)
      [Symbol.asyncIterator]();

    const pending = iterator.next();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).resolves.toEqual({ done: true, value: undefined });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
