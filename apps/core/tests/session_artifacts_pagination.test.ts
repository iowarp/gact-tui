/**
 * gact-tui#363: the server clamps `GET /v1/sessions/{id}/artifacts` to
 * limit=50/max=200 and returns `next_cursor`; every existing client call
 * site discarded it, so any session holding >50 artifact records silently
 * under-reported. `fetchAllSessionArtifacts` walks every page via
 * `next_cursor`, mirroring the proven progressive-load backfill idiom
 * (`backfillChildMessages` in apps/web/src/session/messageEvents.ts):
 * isStale checked before EVERY round trip, bail silently, keep-what-you-had
 * on a failed page — never a fabricated gap, never a thrown rejection.
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchAllSessionArtifacts, type SessionArtifactsResult } from '../src/client/session_artifacts.js';
import type { HttpTransport } from '../src/client/transport.js';

/** The minimal transport shape `fetchAllSessionArtifacts` needs — `get`'s
 *  real signature is generic (`<T>(path: string) => Promise<T>`), so the fake
 *  below implements it as a real generic method rather than a fixed-return
 *  arrow function (the latter doesn't structurally satisfy `HttpTransport`). */
type FakeTransport = Pick<HttpTransport, 'get'>;

function artifact(name: string): SessionArtifactsResult['artifacts'][number] {
  return { name, versions: [] };
}

function fakeTransport(pages: Record<string, SessionArtifactsResult>, calls: string[]): FakeTransport {
  const getImpl = vi.fn(async (path: string): Promise<SessionArtifactsResult> => {
    calls.push(path);
    const cursorMatch = /before=([^&]+)/.exec(path);
    const key = cursorMatch ? decodeURIComponent(cursorMatch[1]!) : 'first';
    const page = pages[key];
    if (!page) throw new Error(`no fixture page for key "${key}" (path: ${path})`);
    return page;
  });
  return {
    get: (<T>(path: string) => getImpl(path) as unknown as Promise<T>) as FakeTransport['get'],
  };
}

describe('fetchAllSessionArtifacts', () => {
  it('two pages: unions both into one result, issues exactly two round trips', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      {
        first: { artifacts: [artifact('a'), artifact('b')], count: 2, next_cursor: 'cursor_2' },
        cursor_2: { artifacts: [artifact('c')], count: 1, next_cursor: null },
      },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['a', 'b', 'c']);
    expect(result.count).toBe(3);
    expect(result.next_cursor).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('one page: issues exactly one round trip', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      { first: { artifacts: [artifact('a')], count: 1, next_cursor: null } },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['a']);
    expect(calls).toHaveLength(1);
  });

  it('one page: absent next_cursor (undefined, not null) also stops the walk', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      { first: { artifacts: [artifact('a')], count: 1 } },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['a']);
    expect(calls).toHaveLength(1);
  });

  it('isStale flips true after page 1: stops with ONLY page-1 data, never fetches page 2', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      {
        first: { artifacts: [artifact('a')], count: 1, next_cursor: 'cursor_2' },
        cursor_2: { artifacts: [artifact('b')], count: 1, next_cursor: null },
      },
      calls,
    );
    // isStale is checked twice per successful iteration (before AND after
    // the round trip, matching backfillChildMessages's double-check) — false
    // for both checks around page 1 (calls 1-2), true from the third call
    // onward, i.e. stale by the time the loop would issue page 2's request.
    let checkCount = 0;
    const result = await fetchAllSessionArtifacts(client, 'sess_1', {
      isStale: () => {
        checkCount += 1;
        return checkCount > 2;
      },
    });

    expect(result.artifacts.map((a) => a.name)).toEqual(['a']);
    expect(calls).toHaveLength(1);
  });

  it('page-2 rejection: keeps page-1 data, never throws', async () => {
    const calls: string[] = [];
    const getImpl = vi.fn(async (path: string): Promise<SessionArtifactsResult> => {
      calls.push(path);
      if (path.includes('before=')) throw new Error('network error on page 2');
      return { artifacts: [artifact('a')], count: 1, next_cursor: 'cursor_2' };
    });
    const client: FakeTransport = {
      get: (<T>(path: string) => getImpl(path) as unknown as Promise<T>) as FakeTransport['get'],
    };

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['a']);
    expect(calls).toHaveLength(2);
  });

  it('page-1 rejection THROWS (unlike page 2+) — an empty union must never masquerade as a healthy zero-artifact read', async () => {
    // Every real call site wraps this in fetchOutcome/try-catch specifically
    // to render an honest "unresolved" state instead of a confident "0"
    // (round-6/round-7 false-zero regressions). Silently swallowing a total
    // failure here would resurrect exactly that bug for the paginated path.
    const getImpl = vi.fn(async (_path: string): Promise<SessionArtifactsResult> => {
      throw new Error('network error on page 1');
    });
    const client: FakeTransport = {
      get: (<T>(path: string) => getImpl(path) as unknown as Promise<T>) as FakeTransport['get'],
    };

    await expect(fetchAllSessionArtifacts(client, 'sess_1')).rejects.toThrow('network error on page 1');
  });

  it('threads includeChildren and pageSize onto every page request', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      { first: { artifacts: [artifact('a')], count: 1, next_cursor: null } },
      calls,
    );

    await fetchAllSessionArtifacts(client, 'sess_1', { includeChildren: true, pageSize: 25 });

    expect(calls[0]).toContain('limit=25');
    expect(calls[0]).toContain('include_children=true');
  });

  it('preserves the LATEST page\'s include_children/child_session_ids on the union result', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      {
        first: {
          artifacts: [artifact('a')],
          count: 1,
          next_cursor: 'cursor_2',
          include_children: true,
          child_session_ids: ['child_1'],
        },
        cursor_2: {
          artifacts: [artifact('b')],
          count: 1,
          next_cursor: null,
          include_children: true,
          child_session_ids: ['child_1', 'child_2'],
        },
      },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1', { includeChildren: true });

    expect(result.include_children).toBe(true);
    expect(result.child_session_ids).toEqual(['child_1', 'child_2']);
  });
});
