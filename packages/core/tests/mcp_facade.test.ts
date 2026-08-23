import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';

describe('Client MCP facade', () => {
  it('keeps MCP methods available on the public Client facade', async () => {
    let seenUrl: string | null = null;
    let seenMethod: string | undefined;
    let seenBody: unknown = null;
    const fetchImpl: typeof fetch = (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      seenMethod = init?.method;
      seenBody = init?.body ? JSON.parse(init.body as string) : null;
      return Promise.resolve(
        new Response('{"result":{"ok":true}}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });

    const result = await c.callMcpTool('server/one', {
      tool: 'search',
      args: { q: 'earthscope' },
      sessionId: 'sess_123',
    });

    expect(seenUrl).toBe('http://localhost:7777/v1/mcp/servers/server%2Fone/call');
    expect(seenMethod).toBe('POST');
    expect(seenBody).toEqual({
      tool: 'search',
      args: { q: 'earthscope' },
      session_id: 'sess_123',
    });
    expect(result.result).toEqual({ ok: true });
  });
});
