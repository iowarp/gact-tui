import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return (input: string | URL | Request) =>
    Promise.resolve(handler(typeof input === 'string' ? input : input.toString()));
}

describe('Client hook endpoints', () => {
  it('createHook POSTs the clio wire shape {event, command} (was {type, handler_uri})', async () => {
    // clio reads body["event"] (400 "hook missing required field: event"
    // if absent) plus command OR url. The desktop previously sent
    // {type, handler_uri}, which clio ignored — every add 400'd.
    let seenUrl: string | null = null;
    let seenMethod: string | undefined;
    let seenBody: Record<string, unknown> | null = null;
    const created = {
      id: 'hook_abc',
      event: 'pre_message',
      command: 'echo hi',
      url: '',
      session_id: '',
      workspace_id: '',
    };
    const fetchImpl: typeof fetch = (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      seenMethod = init?.method;
      seenBody = init?.body ? JSON.parse(init.body as string) : null;
      return Promise.resolve(
        new Response(JSON.stringify(created), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    const row = await c.createHook({ event: 'pre_message', command: 'echo hi' });
    expect(seenUrl).toBe('http://localhost:7777/v1/hooks');
    expect(seenMethod).toBe('POST');
    // Exact body — no stray `type` / `handler_uri` keys.
    expect(seenBody).toEqual({ event: 'pre_message', command: 'echo hi' });
    // Created row parses with the real field names.
    expect(row.id).toBe('hook_abc');
    expect(row.event).toBe('pre_message');
    expect(row.command).toBe('echo hi');
  });

  it('createHook supports the url variant (command omitted)', async () => {
    let seenBody: Record<string, unknown> | null = null;
    const fetchImpl: typeof fetch = (_input, init) => {
      seenBody = init?.body ? JSON.parse(init.body as string) : null;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'hook_url',
            event: 'post_tool',
            command: '',
            url: 'http://localhost:9999/hook',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    const row = await c.createHook({ event: 'post_tool', url: 'http://localhost:9999/hook' });
    expect(seenBody).toEqual({ event: 'post_tool', url: 'http://localhost:9999/hook' });
    expect(row.url).toBe('http://localhost:9999/hook');
  });

  it('hooks() parses {id, event, command, url} rows (not {type, handler_uri})', async () => {
    const rows = {
      hooks: [
        {
          id: 'hook_1',
          event: 'pre_message',
          command: 'echo hi',
          url: '',
          session_id: '',
          workspace_id: '',
        },
        {
          id: 'hook_2',
          event: 'on_error',
          command: '',
          url: 'http://localhost:9999/err',
        },
      ],
    };
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(
        () =>
          new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    });
    const out = await c.hooks();
    expect(out.hooks).toHaveLength(2);
    expect(out.hooks[0]!.event).toBe('pre_message');
    expect(out.hooks[0]!.command).toBe('echo hi');
    expect(out.hooks[1]!.event).toBe('on_error');
    expect(out.hooks[1]!.url).toBe('http://localhost:9999/err');
  });

  it('deleteHook DELETEs /v1/hooks/{id}', async () => {
    let seenUrl: string | null = null;
    let seenMethod: string | undefined;
    const fetchImpl: typeof fetch = (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      seenMethod = init?.method;
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    await c.deleteHook('hook_abc');
    expect(seenUrl).toBe('http://localhost:7777/v1/hooks/hook_abc');
    expect(seenMethod).toBe('DELETE');
  });

  it('tolerates 204 No Content on POST', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((_input) => Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch,
    });
    const out = await c.resolvePermission('perm_a', 'deny');
    expect(out).toBeUndefined();
  });
});
