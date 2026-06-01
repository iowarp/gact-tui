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

  it('summarizeSession POSTs to /v1/sessions/{id}/summarize with the body', async () => {
    let seenUrl: string | null = null;
    let seenMethod: string | undefined;
    let seenBody: unknown = null;
    const fetchImpl: typeof fetch = (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      seenMethod = init?.method;
      seenBody = init?.body ? JSON.parse(init.body as string) : null;
      return Promise.resolve(
        new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    await c.summarizeSession('sess_abc', { auto: false, instructions: 'tldr' });
    expect(seenUrl).toBe('http://localhost:7777/v1/sessions/sess_abc/summarize');
    expect(seenMethod).toBe('POST');
    expect(seenBody).toEqual({ auto: false, instructions: 'tldr' });
  });

  it('lifts structured GACT error envelopes onto HttpError.errorInfo', async () => {
    const body = JSON.stringify({
      error: {
        error: 'config_error',
        message: 'ClioAgent not wired into this build. Set CLIO_LM_PROVIDER.',
        details: { session_id: 'sess_abc' },
        recoverable: false,
      },
    });
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(() => new Response(body, { status: 400, statusText: 'Bad Request' })),
    });
    try {
      await c.capabilities();
      throw new Error('expected throw');
    } catch (e) {
      const err = e as HttpError;
      expect(err).toBeInstanceOf(HttpError);
      expect(err.errorInfo?.error).toBe('config_error');
      expect(err.errorInfo?.recoverable).toBe(false);
      expect(err.errorInfo?.details).toEqual({ session_id: 'sess_abc' });
      expect(err.message).toContain('ClioAgent not wired');
    }
  });

  it('builds SSE URL with auth_token query param', () => {
    const c = new Client({ baseUrl: 'http://localhost:7777', bearerToken: 'tok' });
    const url = new URL(c.sseUrl('sess_abc'));
    expect(url.pathname).toBe('/v1/sessions/sess_abc/events');
    expect(url.searchParams.get('auth_token')).toBe('tok');
  });

  it('createSession POSTs to /v1/sessions', async () => {
    let calledUrl = '';
    let calledMethod = '';
    let calledBody = '';
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((input, init) => {
        calledUrl = typeof input === 'string' ? input : input.toString();
        calledMethod = init?.method ?? 'GET';
        calledBody = (init?.body as string) ?? '';
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'sess_new',
              title: 'hi',
              status: 'idle',
              created_at: '',
              updated_at: '',
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
        );
      }) as typeof fetch,
    });
    const s = await c.createSession({ title: 'hi' });
    expect(s.id).toBe('sess_new');
    expect(calledUrl).toBe('http://localhost:7777/v1/sessions');
    expect(calledMethod).toBe('POST');
    expect(JSON.parse(calledBody)).toMatchObject({ title: 'hi' });
  });

  it('sendMessage wraps the payload in role+parts', async () => {
    let body: Record<string, unknown> = {};
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((_input, init) => {
        body = JSON.parse((init?.body as string) ?? '{}');
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'msg_1', role: 'user', parts: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }) as typeof fetch,
    });
    await c.sendMessage('sess_x', { text: 'hello' });
    expect(body.role).toBe('user');
    expect(body.parts).toEqual([{ type: 'text', text: 'hello' }]);
  });

  it('resolvePermission maps decision+scope onto clio action enum', async () => {
    // clio's /v1/permissions/{id} reads `{ action: 'allow' | 'deny' |
    // 'allow_session' | 'allow_workspace' }`. The desktop's UI thinks
    // in (decision, scope), so the client must collapse the two into
    // the single backend enum — otherwise the agent stays waiting
    // forever (422 silent).
    const observed: Array<Record<string, unknown>> = [];
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((_input, init) => {
        observed.push(JSON.parse((init?.body as string) ?? '{}'));
        return Promise.resolve(new Response(null, { status: 204 }));
      }) as typeof fetch,
    });
    await c.resolvePermission('perm_a', 'approve', 'always_tool');
    await c.resolvePermission('perm_b', 'approve', 'session');
    await c.resolvePermission('perm_c', 'approve', 'once');
    await c.resolvePermission('perm_d', 'deny');
    expect(observed).toEqual([
      { action: 'allow_workspace' },
      { action: 'allow_session' },
      { action: 'allow' },
      { action: 'deny' },
    ]);
  });

  it('tolerates 204 No Content on POST', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((_input) =>
        Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch,
    });
    const out = await c.resolvePermission('perm_a', 'deny');
    expect(out).toBeUndefined();
  });
});
