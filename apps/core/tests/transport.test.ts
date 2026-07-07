import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Client, TransportTimeoutError } from '../src/client/http.js';

/**
 * A fetch stub that never settles on its own — it only rejects when its
 * AbortSignal fires (mirroring how a real fetch aborts). This lets the fake
 * timer drive the transport timeout deterministically.
 */
function hangingFetch(): typeof fetch {
  return ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        if (signal.aborted) {
          reject(new DOMException('aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
      }
    })) as typeof fetch;
}

function jsonFetch(status: number, body: string): typeof fetch {
  return (() =>
    Promise.resolve(
      new Response(body, {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )) as typeof fetch;
}

describe('HttpTransport timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects with TransportTimeoutError after the default 30s', async () => {
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: hangingFetch() });
    const p = c.response('/v1/health');
    // Attach a rejection handler before advancing so no unhandled rejection.
    const assertion = expect(p).rejects.toBeInstanceOf(TransportTimeoutError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it('honors a custom timeoutMs', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: hangingFetch(),
      timeoutMs: 5_000,
    });
    const p = c.response('/v1/health');
    const assertion = expect(p).rejects.toBeInstanceOf(TransportTimeoutError);
    await vi.advanceTimersByTimeAsync(5_000);
    await assertion;
  });

  it('does not time out before the deadline', async () => {
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: hangingFetch() });
    let settled = false;
    const p = c.response('/v1/health').catch(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(settled).toBe(false);
    // Drain: fire the timeout so the promise settles and no rejection leaks.
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(settled).toBe(true);
  });

  it('timeoutMs:0 disables the timeout (caller signal still cancels)', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: hangingFetch(),
      timeoutMs: 0,
    });
    let settled = false;
    const p = c.response('/v1/health').catch(() => {
      settled = true;
    });
    // Well past the default deadline — must not fire.
    await vi.advanceTimersByTimeAsync(120_000);
    expect(settled).toBe(false);
    // No timer is armed, so nothing else will settle it — leave it dangling
    // (its handler is attached, so no unhandled rejection).
    void p;
  });

  it('re-throws the caller AbortError (not a timeout) when the caller aborts', async () => {
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: hangingFetch() });
    const ac = new AbortController();
    const p = c.response('/v1/health', { signal: ac.signal });
    const assertion = expect(p).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && err.name === 'AbortError',
    );
    ac.abort();
    await assertion;
  });

  it('leaves the JSON happy path unaffected', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: jsonFetch(200, '{"contract_version":"0.2"}'),
    });
    const res = await c.response('/v1/health');
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ contract_version: '0.2' });
  });

  it('leaves a 204 response body path unaffected', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: (() => Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch,
    });
    const res = await c.response('/v1/health', { method: 'DELETE' });
    expect(res.status).toBe(204);
  });
});
