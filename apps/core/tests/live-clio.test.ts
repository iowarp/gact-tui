/**
 * Live integration smoke against a running `clio-agent-gact` server.
 *
 * Skipped when no backend is reachable on `CLIO_GACT_URL` (default
 * http://127.0.0.1:17800) so it doesn't break CI runners. On a dev
 * machine with the server running these specs catch real wire drift —
 * exactly the kind of drift that the fixtures-only test set missed
 * (Capabilities nesting, SSE envelope `payload` shape, etc.).
 */

import { afterAll, describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';
import { parseSseBlock } from '../src/client/sse.js';

const BASE = process.env['CLIO_GACT_URL'] ?? 'http://127.0.0.1:17800';

let reachable = false;
try {
  const res = await fetch(`${BASE}/v1/capabilities`, {
    signal: AbortSignal.timeout(800),
  });
  reachable = res.ok;
} catch {
  reachable = false;
}

const describeIf = reachable ? describe : describe.skip;

describeIf(`live clio-agent-gact @ ${BASE}`, () => {
  const client = new Client({ baseUrl: BASE });
  const created: string[] = [];
  let workspaceId: string | undefined;

  async function createLiveSession(title: string) {
    if (!workspaceId) {
      const { workspaces } = await client.workspaces();
      workspaceId = workspaces[0]?.id;
    }
    return client.createSession({
      title,
      ...(workspaceId ? { workspace_id: workspaceId } : {}),
    });
  }

  afterAll(async () => {
    // Best-effort cleanup of the sessions we created in this test run.
    for (const id of created) {
      try {
        await fetch(`${BASE}/v1/sessions/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      } catch {
        // tolerated
      }
    }
  });

  it('returns a SPEC-shaped capabilities envelope', async () => {
    const caps = await client.capabilities();
    expect(caps.contract_version).toBe('0.2');
    expect(caps.backend?.name).toBeTypeOf('string');
    expect(caps.backend?.vendor).toBeTypeOf('string');
    expect(caps.capabilities).toBeTypeOf('object');
    expect(caps.transports?.events_sse).toBe(true);
    expect(Array.isArray(caps.auth?.schemes)).toBe(true);
  });

  it('createSession + listSessions round-trips', async () => {
    const s = await createLiveSession('core-live-smoke');
    expect(s.id).toMatch(/^sess_/);
    created.push(s.id);

    // clio scopes an unfiltered list to the DEFAULT workspace; this session
    // was created in workspaces[0] (not necessarily the default), so the
    // round-trip must ask for all workspaces — exactly what LiveSessions does.
    const list = await client.sessions({ include_all_workspaces: true });
    expect(list.sessions.find((r) => r.id === s.id)).toBeTruthy();
  });

  it('messages list starts empty on a fresh session', async () => {
    const s = await createLiveSession('core-live-msg-empty');
    created.push(s.id);
    const { messages } = await client.messages(s.id);
    expect(messages).toHaveLength(0);
  });

  it('SSE stream opens with a SPEC-shaped server.connected envelope', async () => {
    const s = await createLiveSession('core-live-sse');
    created.push(s.id);

    const url = client.sseUrl(s.id);
    const resp = await fetch(url);
    expect(resp.ok).toBe(true);
    const reader = resp.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';

    let firstEvent: ReturnType<typeof parseSseBlock> | null = null;
    const start = Date.now();
    while (Date.now() - start < 3_000 && !firstEvent) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const blocks = buf.split(/\r?\n\r?\n/);
      buf = blocks.pop() ?? '';
      for (const b of blocks) {
        firstEvent = parseSseBlock(b);
        if (firstEvent) break;
      }
    }
    await reader.cancel();
    expect(firstEvent).not.toBeNull();
    // First event is server.connected per SPEC §7.1.
    expect(firstEvent?.type).toBe('server.connected');
    expect(firstEvent?.occurred_at).toBeTypeOf('string');
    expect(firstEvent?.payload).toBeTypeOf('object');
  });
});
