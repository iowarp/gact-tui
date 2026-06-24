import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  return (input: string | URL | Request) =>
    Promise.resolve(handler(typeof input === 'string' ? input : input.toString()));
}

describe('Client catalog lifecycle endpoints', () => {
  it('validateAgentBlueprint posts {path,scope} and maps enabled→ok', async () => {
    let seenUrl: string | null = null;
    let seenBody: unknown = null;
    const fetchImpl: typeof fetch = (input, init) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      seenBody = init?.body ? JSON.parse(init.body as string) : null;
      return Promise.resolve(
        new Response(JSON.stringify({ enabled: true, validation_errors: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    const v = await c.validateAgentBlueprint({ path: 'src/bp', scope: 'workspace' });
    expect(seenUrl).toBe('http://localhost:7777/v1/agent-blueprints/validate');
    expect(seenBody).toEqual({ path: 'src/bp', scope: 'workspace' });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it('installAgentBlueprint posts to /install (not the GET-only collection)', async () => {
    let seenUrl: string | null = null;
    const fetchImpl: typeof fetch = (input) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      return Promise.resolve(
        new Response('{"id":"bp_1"}', {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    await c.installAgentBlueprint({ source: 'src/bp', scope: 'workspace' });
    expect(seenUrl).toBe('http://localhost:7777/v1/agent-blueprints/install');
  });

  it('uses the expert-pack 0.5.3 lifecycle endpoints', async () => {
    const seen: Array<{ url: string; method?: string; body?: unknown }> = [];
    const fetchImpl: typeof fetch = (input, init) => {
      seen.push({
        url: typeof input === 'string' ? input : input.toString(),
        method: init?.method,
        body: init?.body ? JSON.parse(init.body as string) : undefined,
      });
      return Promise.resolve(
        init?.method === 'DELETE'
          ? new Response(null, { status: 204 })
          : new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            }),
      );
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });

    await c.installExpertPack({ source: 'https://example.test/pack.git', scope: 'workspace' });
    await c.updateExpertPack('pack_x', { scope: 'workspace', workspace_id: 'ws1' });
    await c.deleteExpertPack('pack_x', { scope: 'workspace', workspace_id: 'ws1' });

    expect(seen).toEqual([
      {
        url: 'http://localhost:7777/v1/expert-packs/install',
        method: 'POST',
        body: { source: 'https://example.test/pack.git', scope: 'workspace' },
      },
      {
        url: 'http://localhost:7777/v1/expert-packs/pack_x/update',
        method: 'POST',
        body: { scope: 'workspace', workspace_id: 'ws1' },
      },
      {
        url: 'http://localhost:7777/v1/expert-packs/pack_x?scope=workspace&workspace_id=ws1',
        method: 'DELETE',
        body: {},
      },
    ]);
  });

  it('merges kind=pack blueprint rows into expertPacks', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch((url) => {
        if (url.endsWith('/v1/expert-packs')) {
          return new Response('{"expert_packs":[]}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/v1/agent-blueprints')) {
          return new Response(
            JSON.stringify({
              agent_blueprints: [
                { id: 'workflow', title: 'Workflow', kind: 'blueprint' },
                { id: 'toolkit', title: 'Toolkit Pack', kind: 'pack', scope: 'workspace' },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
        return new Response('{}', { status: 404 });
      }),
    });

    const packs = await c.expertPacks();

    expect(packs.packs).toEqual([
      { id: 'toolkit', name: 'Toolkit Pack', kind: 'pack', scope: 'workspace' },
    ]);
  });

  it('scopes expert-pack listing and blueprint fallback by workspace/session', async () => {
    const seen: string[] = [];
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: mockFetch((url) => {
        seen.push(url);
        if (url.includes('/v1/expert-packs')) {
          return new Response('{"expert_packs":[]}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/v1/agent-blueprints')) {
          return new Response('{"agent_blueprints":[]}', {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response('{}', { status: 404 });
      }),
    });

    await c.expertPacks({ workspace_id: 'ws1', session_id: 'sess1' });

    expect(seen).toEqual([
      'http://localhost:7777/v1/expert-packs?workspace_id=ws1&session_id=sess1',
      'http://localhost:7777/v1/agent-blueprints?workspace_id=ws1&session_id=sess1',
    ]);
  });

  it('uninstallAgentBlueprint passes scope/workspace_id query params (W2 wire fix)', async () => {
    let seenUrl: string | null = null;
    const fetchImpl: typeof fetch = (input) => {
      seenUrl = typeof input === 'string' ? input : input.toString();
      return Promise.resolve(new Response(null, { status: 204 }));
    };
    const c = new Client({ baseUrl: 'http://localhost:7777', fetch: fetchImpl });
    // Without opts: bare DELETE (clio defaults to workspace scope).
    await c.uninstallAgentBlueprint('bp_x');
    expect(seenUrl).toBe('http://localhost:7777/v1/agent-blueprints/bp_x');
    // With a global scope: must ride as a query param or clio can't match it.
    await c.uninstallAgentBlueprint('bp_y', { scope: 'global' });
    expect(seenUrl).toBe('http://localhost:7777/v1/agent-blueprints/bp_y?scope=global');
  });
});
