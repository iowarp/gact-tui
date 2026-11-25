import { describe, expect, it } from 'vitest';
import { RecordingTransport } from './recording-transport.test-helper.js';
import { ClioRepository } from './repository.js';
import { VIEW_CALL_PREFER, requestViewCall } from './view-call-pending.js';

const pending = (id: string) => ({
  view_call_pending: {
    id,
    location: `/v1/sessions/s/mcp-apps/pending/${id}`,
    route: 'reopen',
    retry_after_ms: 1,
  },
});

describe('view calls that answer 202', () => {
  it('asks to be answered async and follows the location to the real answer', async () => {
    const transport = new RecordingTransport([pending('p1'), pending('p1'), { live: true }]);
    const answer = await requestViewCall(transport, {
      method: 'POST',
      path: '/v1/sessions/s/mcp-apps/reopen',
      body: { app_instance_id: 'a' },
      decode: (value) => (value as { live: boolean }).live,
    });
    expect(answer).toBe(true);
    expect(transport.requests[0]?.headers).toEqual({ Prefer: VIEW_CALL_PREFER });
    expect(transport.requests.slice(1).map((r) => [r.method, r.path])).toEqual([
      ['GET', '/v1/sessions/s/mcp-apps/pending/p1'],
      ['GET', '/v1/sessions/s/mcp-apps/pending/p1'],
    ]);
  });

  it('decodes an inline answer as before (a CLIO without the preference)', async () => {
    const transport = new RecordingTransport([{ live: false }]);
    const answer = await requestViewCall(transport, {
      method: 'GET',
      path: '/x',
      decode: (value) => (value as { live: boolean }).live,
    });
    expect(answer).toBe(false);
    expect(transport.requests).toHaveLength(1);
  });

  it('surfaces the call error from the location', async () => {
    const transport = new RecordingTransport([pending('p2'), new Error('HTTP 502')]);
    await expect(
      requestViewCall(transport, { method: 'GET', path: '/x', decode: (value) => value }),
    ).rejects.toThrow('HTTP 502');
  });

  it('cancels the call on the server when the caller aborts', async () => {
    const controller = new AbortController();
    const transport = new RecordingTransport([
      { view_call_pending: { ...pending('p3').view_call_pending, retry_after_ms: 5_000 } },
      {},
    ]);
    const call = requestViewCall(transport, {
      method: 'GET',
      path: '/x',
      decode: (value) => value,
      signal: controller.signal,
    });
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    await expect(call).rejects.toBeDefined();
    expect(transport.requests.at(-1)).toMatchObject({
      method: 'DELETE',
      path: '/v1/sessions/s/mcp-apps/pending/p3',
    });
  });

  it('is how the repository mounts and reopens a view', async () => {
    const transport = new RecordingTransport([
      pending('p4'),
      { error: { reason: 'tool_error', detail: 'd' }, saved_call: null },
    ]);
    const result = await new ClioRepository(transport).reopenMcpApp('s', 'old');
    expect(result).toMatchObject({ ok: false, reason: 'tool_error' });
    expect(transport.requests[0]?.headers?.Prefer).toBe(VIEW_CALL_PREFER);
  });
});
