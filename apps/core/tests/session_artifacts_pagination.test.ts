/**
 * gact-tui#363: the server clamps `GET /v1/sessions/{id}/artifacts` to
 * limit=50/max=200 and returns `next_cursor`; every existing client call
 * site discarded it, so any session holding >50 artifact records silently
 * under-reported. `fetchAllSessionArtifacts` walks every page via
 * `next_cursor`, mirroring the proven progressive-load backfill idiom
 * (`backfillChildMessages` in apps/web/src/session/messageEvents.ts):
 * isStale checked before EVERY round trip, bail silently, keep-what-you-had
 * on a failed page — never a fabricated gap, never a thrown rejection.
 *
 * Opus adversarial review (PROVEN DEFECT): the walk had no cycle guard or
 * page cap — a constant/looping `next_cursor` looped 501 requests and then
 * resolved SUCCESSFULLY with 500 duplicated records. Every test below that
 * exercises a normal complete read also pins `truncated: null` (the
 * "genuinely complete" contract), and the cycle/cap/failure/stale cases each
 * pin their own typed `truncated` reason — no silent partial is ever
 * byte-identical to a complete one.
 */
import { describe, expect, it, vi } from 'vitest';
import { fetchAllSessionArtifacts, type SessionArtifactsResult } from '../src/client/session_artifacts.js';
import type { HttpTransport } from '../src/client/transport.js';

/** The minimal transport shape `fetchAllSessionArtifacts` needs — `get`'s
 *  real signature is generic (`<T>(path: string) => Promise<T>`), so the fake
 *  below implements it as a real generic method rather than a fixed-return
 *  arrow function (the latter doesn't structurally satisfy `HttpTransport`). */
type FakeTransport = Pick<HttpTransport, 'get'>;

function artifact(
  name: string,
  overrides: Partial<SessionArtifactsResult['artifacts'][number]> = {},
): SessionArtifactsResult['artifacts'][number] {
  return { name, versions: [], ...overrides };
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
  it('two pages: unions both into one result, issues exactly two round trips, truncated: null (complete read)', async () => {
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
    expect(result.truncated).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('one page: issues exactly one round trip, truncated: null', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      { first: { artifacts: [artifact('a')], count: 1, next_cursor: null } },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['a']);
    expect(result.truncated).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('one page: absent next_cursor (undefined, not null) also stops the walk, truncated: null', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      { first: { artifacts: [artifact('a')], count: 1 } },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['a']);
    expect(result.truncated).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it('isStale flips true after page 1: stops with ONLY page-1 data, never fetches page 2, truncated: stale', async () => {
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
    expect(result.truncated).toBe('stale');
    expect(calls).toHaveLength(1);
  });

  it('immediately stale (before even the first round trip): {artifacts: [], truncated: stale} — never mistakable for a genuine empty session', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      { first: { artifacts: [artifact('a')], count: 1, next_cursor: null } },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1', { isStale: () => true });

    expect(result.artifacts).toEqual([]);
    expect(result.count).toBe(0);
    expect(result.truncated).toBe('stale');
    expect(calls).toHaveLength(0);
  });

  it('page-2 rejection: keeps page-1 data, never throws, truncated: page_fetch_failed', async () => {
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
    expect(result.truncated).toBe('page_fetch_failed');
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

  // --- Opus adversarial review, PROVEN DEFECT: unbounded cursor walk -------

  it('a CONSTANT next_cursor (the proven repro shape) is caught by cycle detection after 2 requests, not looped forever', async () => {
    const calls: string[] = [];
    const getImpl = vi.fn(async (path: string): Promise<SessionArtifactsResult> => {
      calls.push(path);
      // Every page — including the first — reports the SAME next_cursor,
      // the exact "looped 501 requests, resolved successfully with 500
      // duplicated records" shape the review proved.
      return { artifacts: [artifact(`from-${calls.length}`)], count: 1, next_cursor: 'stuck_cursor' };
    });
    const client: FakeTransport = {
      get: (<T>(path: string) => getImpl(path) as unknown as Promise<T>) as FakeTransport['get'],
    };

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    // Page 1 establishes 'stuck_cursor'; page 2 (fetched with
    // before=stuck_cursor) reports the SAME cursor again — caught on the
    // very next iteration, before a third request ever fires.
    expect(calls).toHaveLength(2);
    expect(result.truncated).toBe('cursor_cycle_detected');
    expect(result.artifacts).toHaveLength(2);
  });

  it('a MULTI-STEP cursor cycle (A -> B -> A -> B -> ...) is also caught, not just an immediate self-repeat', async () => {
    const calls: string[] = [];
    const getImpl = vi.fn(async (path: string): Promise<SessionArtifactsResult> => {
      calls.push(path);
      const usingB = path.includes('before=cursor_b');
      return {
        artifacts: [artifact(`page-${calls.length}`)],
        count: 1,
        // First request (no before=) and every "A" page point to B; every
        // "B" page points back to A — a 2-cycle, never an immediate repeat.
        next_cursor: usingB ? 'cursor_a' : 'cursor_b',
      };
    });
    const client: FakeTransport = {
      get: (<T>(path: string) => getImpl(path) as unknown as Promise<T>) as FakeTransport['get'],
    };

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    // page1(->cursor_b) page2@b(->cursor_a) page3@a(->cursor_b, ALREADY SEEN) = 3 requests.
    expect(calls).toHaveLength(3);
    expect(result.truncated).toBe('cursor_cycle_detected');
  });

  it('an ever-advancing, never-repeating cursor still gets bounded by the hard page cap', async () => {
    const calls: string[] = [];
    const getImpl = vi.fn(async (path: string): Promise<SessionArtifactsResult> => {
      calls.push(path);
      // A fresh, never-before-seen cursor every time — this alone would
      // loop forever without a hard cap (no cycle to detect).
      return { artifacts: [artifact(`page-${calls.length}`)], count: 1, next_cursor: `cursor_${calls.length}` };
    });
    const client: FakeTransport = {
      get: (<T>(path: string) => getImpl(path) as unknown as Promise<T>) as FakeTransport['get'],
    };

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.truncated).toBe('page_cap_reached');
    // Bounded — nowhere near the 501 the review's proven repro hit.
    expect(calls.length).toBeLessThan(150);
    expect(calls.length).toBeGreaterThan(0);
  });

  // --- Opus adversarial review, named fix: de-dupe by identity -------------

  it('a boundary record repeated across two pages (overlapping cursor window) collapses to ONE entry, correct count', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      {
        first: {
          artifacts: [artifact('a', { head_artifact_id: 'art_a' }), artifact('boundary', { head_artifact_id: 'art_b' })],
          count: 2,
          next_cursor: 'cursor_2',
        },
        // The SAME record (by head_artifact_id) appears again at the top of
        // page 2 — a real shape when artifacts are created concurrently
        // with the walk and shift the cursor window.
        cursor_2: {
          artifacts: [artifact('boundary', { head_artifact_id: 'art_b' }), artifact('c', { head_artifact_id: 'art_c' })],
          count: 2,
          next_cursor: null,
        },
      },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['a', 'boundary', 'c']);
    expect(result.count).toBe(3);
    expect(calls).toHaveLength(2);
  });

  it('dedupes by name when head_artifact_id is absent on both sides', async () => {
    const calls: string[] = [];
    const client = fakeTransport(
      {
        first: { artifacts: [artifact('shared')], count: 1, next_cursor: 'cursor_2' },
        cursor_2: { artifacts: [artifact('shared'), artifact('unique')], count: 2, next_cursor: null },
      },
      calls,
    );

    const result = await fetchAllSessionArtifacts(client, 'sess_1');

    expect(result.artifacts.map((a) => a.name)).toEqual(['shared', 'unique']);
    expect(result.count).toBe(2);
  });
});
