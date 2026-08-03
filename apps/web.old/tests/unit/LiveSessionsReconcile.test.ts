import { createRoot } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '@clio/core';
import { createLiveSessions } from '../../src/LiveSessions.js';

function session(id: string, overrides: Partial<Session> = {}): Session {
  return {
    id,
    title: `Session ${id}`,
    status: 'idle',
    workspace_id: 'ws',
    created_at: '2026-06-20T11:00:00.000Z',
    updated_at: '2026-06-20T11:00:00.000Z',
    ...overrides,
  } as Session;
}

function stubSessions(rows: Session[]): typeof globalThis.fetch {
  return vi.fn(async () =>
    new Response(JSON.stringify({ sessions: rows }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  ) as unknown as typeof globalThis.fetch;
}

// Wait for the createResource fetch to settle.
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createLiveSessions refetch reconciliation', () => {
  it('preserves pending SSE per-session patches across a refetch', async () => {
    globalThis.fetch = stubSessions([session('s1', { status: 'idle' })]);

    await createRoot(async (dispose) => {
      const handle = createLiveSessions({ url: 'http://localhost:9', bearerToken: 't' });
      await tick();

      // SSE pushes a status change ahead of the next list fetch.
      handle.patch('s1', { status: 'running' });
      expect(handle.sessions()?.find((s) => s.id === 's1')?.status).toBe('running');

      // A refetch lands (e.g. after a terminal event). The backend list is the
      // pre-SSE snapshot (still 'idle'); the pending patch must survive so the
      // sidebar pip does not regress to stale state.
      handle.refetch();
      await tick();

      expect(handle.sessions()?.find((s) => s.id === 's1')?.status).toBe('running');
      dispose();
    });
  });

  it('reflects fresh backend data for fields with no pending patch', async () => {
    globalThis.fetch = stubSessions([session('s1', { status: 'idle', title: 'Fresh title' })]);

    await createRoot(async (dispose) => {
      const handle = createLiveSessions({ url: 'http://localhost:9', bearerToken: 't' });
      await tick();

      handle.patch('s1', { status: 'running' });
      handle.refetch();
      await tick();

      const row = handle.sessions()?.find((s) => s.id === 's1');
      // Patched field wins, un-patched field reflects the fresh fetch.
      expect(row?.status).toBe('running');
      expect(row?.title).toBe('Fresh title');
      dispose();
    });
  });
});
