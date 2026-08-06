import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';
import { fetchSessionTrace } from '../src/client/session_trace.js';
import { HttpError } from '../src/client/transport.js';

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return (input: string | URL | Request) =>
    Promise.resolve(handler(typeof input === 'string' ? input : input.toString()));
}

describe('Client session endpoints', () => {
  it('lists sessions with workspace scope query options', async () => {
    const seen: string[] = [];
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch((url) => {
        seen.push(url);
        return new Response('{"sessions":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    });

    await c.sessions({ include_all_workspaces: true });
    await c.sessions({ archived: true, workspace_id: 'ws_demo' });

    expect(seen).toEqual([
      'http://localhost:7777/v1/sessions?include_all_workspaces=true',
      'http://localhost:7777/v1/sessions?archived=true&workspace_id=ws_demo',
    ]);
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

  it('uploadAttachment POSTs base64-encoded bytes to /attachments', async () => {
    let seenUrl: string | null = null;
    let seenBody: { file?: string; filename?: string; mime_type?: string; mode?: string } | null =
      null;
    const fetchImpl: typeof fetch = (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      seenBody = init?.body ? JSON.parse(init.body as string) : null;
      return Promise.resolve(
        new Response(JSON.stringify({ path: '.clio/attachments/s/x.txt', mode: 'read' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    const bytes = new Uint8Array([104, 105]); // "hi"
    const file = {
      name: 'x.txt',
      type: 'text/plain',
      arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    };
    const row = await c.uploadAttachment('sess_abc', file, 'read');
    expect(seenUrl).toBe('http://localhost:7777/v1/sessions/sess_abc/attachments');
    // NOT multipart — a JSON body with the bytes base64-encoded.
    expect(seenBody!.filename).toBe('x.txt');
    expect(seenBody!.mime_type).toBe('text/plain');
    expect(seenBody!.mode).toBe('read');
    expect(seenBody!.file).toBe('aGk='); // base64("hi")
    expect(row.path).toBe('.clio/attachments/s/x.txt');
  });

  it('retryTurn POSTs to messages/{id}/retry preserving attempt lineage', async () => {
    let seenUrl: string | null = null;
    let seenBody: unknown = null;
    const fetchImpl: typeof fetch = (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      seenBody = init?.body ? JSON.parse(init.body as string) : null;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: 'att_1',
            session_id: 's',
            source_message_id: 'msg_9',
            status: 'queued',
            created_at: '',
            updated_at: '',
          }),
          { status: 202, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    const a = await c.retryTurn('s', 'msg_9', { execute: true });
    expect(seenUrl).toBe('http://localhost:7777/v1/sessions/s/messages/msg_9/retry');
    expect(seenBody).toEqual({ execute: true });
    expect(a.id).toBe('att_1');
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

  it('sendMessage appends text parts without client-only role fields', async () => {
    let body: Record<string, unknown> = {};
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((_input, init) => {
        body = JSON.parse((init?.body as string) ?? '{}');
        return Promise.resolve(
          new Response(
            JSON.stringify({ message_id: 'msg_1', accepted_at: '2026-01-01T00:00:00Z' }),
            {
              status: 202,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        );
      }) as typeof fetch,
    });
    await c.sendMessage('sess_x', { text: 'hello' });
    expect(body.role).toBeUndefined();
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

  it('exportArtifact GETs /v1/artifacts/{id}/export and names the file from Content-Disposition', async () => {
    let seenUrl: string | null = null;
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: (input) => {
        seenUrl = typeof input === 'string' ? input : input.toString();
        return Promise.resolve(
          new Response(new Blob(['zip bytes']), {
            status: 200,
            headers: {
              'Content-Type': 'application/zip',
              'Content-Disposition': 'attachment; filename="artifact_abc.crate.zip"',
            },
          }),
        );
      },
    });
    const result = await c.exportArtifact('artifact_abc');
    expect(seenUrl).toBe('http://localhost:7777/v1/artifacts/artifact_abc/export');
    expect(result.filename).toBe('artifact_abc.crate.zip');
    expect(result.blob.size).toBeGreaterThan(0);
  });

  it('exportArtifact falls back to the backend naming convention when Content-Disposition is absent', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: () =>
        Promise.resolve(new Response(new Blob(['zip bytes']), { status: 200 })),
    });
    const result = await c.exportArtifact('artifact_xyz');
    expect(result.filename).toBe('artifact_xyz.crate.zip');
  });

  it('exportArtifact throws a typed HttpError on an unknown artifact (real 404, not a silent empty download)', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { error: 'not_found' } }), { status: 404 }),
        ),
    });
    await expect(c.exportArtifact('artifact_missing')).rejects.toBeInstanceOf(HttpError);
  });
});

describe('fetchSessionTrace (GET /v1/sessions/{sid}/trace)', () => {
  it('reads the bare trace with no query when no options are given', async () => {
    const seen: string[] = [];
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch((url) => {
        seen.push(url);
        return new Response('{"events":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    });
    const result = await fetchSessionTrace(c, 'sess_abc');
    expect(seen).toEqual(['http://localhost:7777/v1/sessions/sess_abc/trace']);
    expect(result.events).toEqual([]);
  });

  it('passes limit and scope through as query params, URL-encoding the session id', async () => {
    const seen: string[] = [];
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch((url) => {
        seen.push(url);
        return new Response('{"events":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    });
    await fetchSessionTrace(c, 'sess abc', { limit: 2000, scope: 'tool.call' });
    expect(seen).toEqual([
      'http://localhost:7777/v1/sessions/sess%20abc/trace?limit=2000&scope=tool.call',
    ]);
  });

  it('surfaces an out-of-range limit as the server 422, never a silent clamp', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(() =>
        new Response(JSON.stringify({ detail: 'limit out of range' }), { status: 422 }),
      ),
    });
    await expect(fetchSessionTrace(c, 'sess_abc', { limit: 5000 })).rejects.toBeInstanceOf(
      HttpError,
    );
  });

  it('returns the semantic events verbatim (payload keys tool/ok/duration_ms untouched)', async () => {
    const event = {
      event_id: '',
      event_type: 'tool.call.completed',
      occurred_at: '2026-08-05T22:53:29.343998+00:00',
      actor: { tool: 'spawn_agent_task' },
      subject: { call_id: 'call_1' },
      payload: { call_id: 'call_1', tool: 'spawn_agent_task', ok: true, duration_ms: 4592.8 },
    };
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch(() =>
        new Response(JSON.stringify({ events: [event] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    });
    const result = await fetchSessionTrace(c, 'sess_abc');
    expect(result.events).toEqual([event]);
  });
});
