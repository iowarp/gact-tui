/**
 * Round-8 owner finding: the composer pill (async chip / `ctx N%` / status
 * bar) froze at its last settle-time value for an entire multi-minute
 * fan-out because `refreshPill` only ever ran at session-select, send, and
 * message.completed|error|deleted — never mid-turn. The fix wires a
 * throttled, event-driven mid-turn refresh into the message-lifecycle SSE
 * effect (SessionView.tsx), gated on `isTurnRunning` and paced by
 * `shouldRefreshPillMidTurn`.
 *
 * Both are pure and exported specifically because jsdom has no EventSource
 * — the SSE effect that consumes them never actually runs under this test
 * harness, so the throttle math and the visibility gate are only reachable
 * as plain functions, not through a live subscription.
 */
import type { Message } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  isTurnRunning,
  PILL_REFRESH_THROTTLE_MS,
  shouldRefreshPillMidTurn,
} from '../../src/session/SessionView';

function assistant(overrides: Partial<Message> = {}): Message {
  return { id: 'm1', role: 'assistant', parts: [], ...overrides } as Message;
}

describe('isTurnRunning — the mid-turn refresh gate (shared with the composer\'s own `running` prop)', () => {
  it('is true while this client\'s own send round-trip is in flight, regardless of messages', () => {
    expect(isTurnRunning(true, [], 'idle')).toBe(true);
  });

  it('is true when the trailing assistant message carries neither stop_reason nor error_info (still streaming)', () => {
    expect(isTurnRunning(false, [assistant()], 'idle')).toBe(true);
  });

  it('is false once the trailing assistant message has a stop_reason', () => {
    expect(isTurnRunning(false, [assistant({ stop_reason: 'end_turn' })], 'running')).toBe(false);
  });

  it('is false once the trailing assistant message carries error_info', () => {
    expect(
      isTurnRunning(false, [assistant({ error_info: { error: 'x', message: 'y' } as never })], 'running'),
    ).toBe(false);
  });

  it('falls back to the session row status when there is no assistant message yet', () => {
    expect(isTurnRunning(false, [], 'running')).toBe(true);
    expect(isTurnRunning(false, [], 'idle')).toBe(false);
  });

  it('reads the LATEST assistant message, not an earlier settled one (a second turn started)', () => {
    const messages = [
      assistant({ id: 'm1', stop_reason: 'end_turn' }),
      { id: 'm2', role: 'user', parts: [] } as unknown as Message,
      assistant({ id: 'm3' }), // no stop_reason yet -- the new turn is live
    ];
    expect(isTurnRunning(false, messages, 'idle')).toBe(true);
  });
});

describe('shouldRefreshPillMidTurn — throttled, and gated on the turn actually being live', () => {
  it('never fires while the turn is not running, no matter how long since the last refresh', () => {
    expect(shouldRefreshPillMidTurn(false, 1_000_000, 0)).toBe(false);
  });

  it('fires on the very first mid-turn event (lastRefreshAt=0, well past any real throttle window)', () => {
    expect(shouldRefreshPillMidTurn(true, Date.now(), 0)).toBe(true);
  });

  it('does NOT fire again immediately after a refresh (back-to-back deltas, the round-7 amplification shape)', () => {
    const now = 10_000;
    expect(shouldRefreshPillMidTurn(true, now, now)).toBe(false);
    expect(shouldRefreshPillMidTurn(true, now + 1, now)).toBe(false);
    expect(shouldRefreshPillMidTurn(true, now + PILL_REFRESH_THROTTLE_MS - 1, now)).toBe(false);
  });

  it('fires again exactly once the throttle window has elapsed', () => {
    const lastRefreshAt = 10_000;
    expect(shouldRefreshPillMidTurn(true, lastRefreshAt + PILL_REFRESH_THROTTLE_MS, lastRefreshAt)).toBe(
      true,
    );
  });

  it('respects a caller-supplied throttle window instead of the default', () => {
    expect(shouldRefreshPillMidTurn(true, 5_000, 0, 10_000)).toBe(false);
    expect(shouldRefreshPillMidTurn(true, 10_000, 0, 10_000)).toBe(true);
  });

  it('a long-idle-then-running transition refreshes immediately rather than waiting out a stale window', () => {
    // lastRefreshAt from a PREVIOUS turn, ages ago -- the moment the session
    // goes running again it should refresh right away, not wait another
    // full throttle window just because "some" time passed since long ago.
    const ancientRefresh = 0;
    const now = 999_999_999;
    expect(shouldRefreshPillMidTurn(true, now, ancientRefresh)).toBe(true);
  });
});
