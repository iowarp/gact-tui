import { describe, expect, it } from 'vitest';
import { Client } from '../src/client/http.js';
import { CompactContextError, type ContextState } from '../src/client/context.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sampleState: ContextState = {
  session_id: 's1',
  scope: 'analyst',
  as_of: 1_700_000_000_000,
  window_tokens: 200_000,
  live_tokens: 12_000,
  pct_used: 0.06,
  used_tokens: 15_500,
  used_pct: 0.0775,
  autocompact_pct: 0.85,
  live_block_count: 7,
  tokens_by_kind: { message: 8_000, tool_call: 4_000 },
  categories: { messages: 8_000, tool_calls: 4_000, framing: 3_500 },
  segments: [{ id: 'seg1', kind: 'message', tokens: 8_000 }],
  render_text: 'Context: 15.5k / 200k',
  render_keys: { pct: '7.8%' },
};

describe('Client context state + compact', () => {
  it('GETs /context/state with the scope query and parses the new fields', async () => {
    let seenUrl = '';
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((input: string | URL | Request) => {
        seenUrl = typeof input === 'string' ? input : input.toString();
        return Promise.resolve(jsonResponse(sampleState));
      }) as typeof fetch,
    });

    const state = await c.getContextState('s1', 'analyst');

    expect(seenUrl).toBe(
      'http://localhost:7777/v1/sessions/s1/context/state?scope=analyst',
    );
    expect(state.used_tokens).toBe(15_500);
    expect(state.used_pct).toBeCloseTo(0.0775);
    expect(state.autocompact_pct).toBe(0.85);
    expect(state.categories.framing).toBe(3_500);
  });

  it('omits the scope query when no scope is given', async () => {
    let seenUrl = '';
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((input: string | URL | Request) => {
        seenUrl = typeof input === 'string' ? input : input.toString();
        return Promise.resolve(jsonResponse({ ...sampleState, scope: '' }));
      }) as typeof fetch,
    });

    await c.getContextState('s1');
    expect(seenUrl).toBe('http://localhost:7777/v1/sessions/s1/context/state');
  });

  it('POSTs /context/compact and returns the updated state', async () => {
    let method = '';
    let seenUrl = '';
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: ((input: string | URL | Request, init?: RequestInit) => {
        seenUrl = typeof input === 'string' ? input : input.toString();
        method = init?.method ?? 'GET';
        return Promise.resolve(jsonResponse(sampleState));
      }) as typeof fetch,
    });

    const state = await c.compactContext('s1', 'analyst');
    expect(method).toBe('POST');
    expect(seenUrl).toBe(
      'http://localhost:7777/v1/sessions/s1/context/compact?scope=analyst',
    );
    expect(state.live_block_count).toBe(7);
  });

  it.each([
    [409, 'nothing_to_compact'],
    [503, 'compaction_unavailable'],
    [404, 'session_not_found'],
  ] as const)(
    'maps the %d compact envelope to a typed CompactContextError (%s)',
    async (status, reason) => {
      const c = new Client({
        baseUrl: 'http://localhost:7777',
        fetch: (() =>
          Promise.resolve(jsonResponse({ error: reason }, status))) as typeof fetch,
      });

      await expect(c.compactContext('s1', 'analyst')).rejects.toMatchObject({
        name: 'CompactContextError',
        reason,
        status,
      });
      await expect(c.compactContext('s1')).rejects.toBeInstanceOf(
        CompactContextError,
      );
    },
  );

  it('falls back to the status code when the error body is not JSON', async () => {
    const c = new Client({
      baseUrl: 'http://localhost:7777',
      fetch: (() =>
        Promise.resolve(
          new Response('upstream boom', { status: 503 }),
        )) as typeof fetch,
    });

    await expect(c.compactContext('s1')).rejects.toMatchObject({
      reason: 'compaction_unavailable',
      status: 503,
    });
  });
});
