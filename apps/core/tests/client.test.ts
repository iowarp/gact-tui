import { describe, expect, it } from 'vitest';
import { Client, HttpError } from '../src/client/http.js';

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return (input: string | URL | Request) =>
    Promise.resolve(handler(typeof input === 'string' ? input : input.toString()));
}

describe('Client', () => {
  it('strips trailing slashes from baseUrl', () => {
    const c = new Client({ baseUrl: 'http://localhost:7777///' });
    expect(c.baseUrl).toBe('http://localhost:7777');
  });

  it('attaches bearer token on capability fetches', async () => {
    let seenAuth: string | null = null;
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      bearerToken: 'tok123',
      fetch: mockFetch((_url) => {
        // Can't easily inspect the per-call headers via the closure signature,
        // so re-derive by reading the second arg in a wrapper below.
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }),
    });
    // Manually peek headers
    const realFetch: typeof fetch = (input, init) => {
      seenAuth = (init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? null;
      return Promise.resolve(
        new Response('{"contract_version":"0.2"}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
    const c2 = new Client({
      baseUrl: 'http://localhost:7777',
      bearerToken: 'tok123',
      fetch: realFetch,
    });
    await c2.capabilities();
    expect(seenAuth).toBe('Bearer tok123');
    // touch c so unused-warn doesn't fire in strict configs
    expect(c.baseUrl).toBe('http://localhost:7777');
  });

  it('throws HttpError on non-2xx', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(() => new Response('nope', { status: 500, statusText: 'Internal Server Error' })),
    });
    await expect(c.capabilities()).rejects.toBeInstanceOf(HttpError);
  });

  it('builds SSE URL with auth_token query param', () => {
    const c = new Client({ baseUrl: 'http://localhost:7777', bearerToken: 'tok' });
    const url = new URL(c.sseUrl('sess_abc'));
    expect(url.pathname).toBe('/v1/sessions/sess_abc/events');
    expect(url.searchParams.get('auth_token')).toBe('tok');
  });
});
