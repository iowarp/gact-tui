/**
 * Round-8 owner finding: the composer pill (async chip / `ctx N%` / status
 * bar) froze at its last settle-time value for an entire multi-minute
 * fan-out because `refreshPill` only ever ran at session-select, send, and
 * message.completed|error|deleted — never mid-turn. The fix wires a
 * throttled, event-driven mid-turn refresh into the message-lifecycle SSE
 * effect (SessionView.tsx), gated on `isTurnRunning` and paced by
 * `shouldRefreshPillMidTurn`.
 *
 * Round-9 owner finding, live SSE capture: two more gaps in that same wiring
 * — (a) a spawn arrives as `message.part.added` carrying an expert_handoff
 * part (status=running), but the SSE switch only matched `message.created`
 * and `message.part.updated{expert_handoff}` — part.added hit `default:
 * break`, so the chip's first paint lagged ~40s behind the real spawn; (b)
 * the refresh disarmed the instant the PARENT turn ended (isTurnRunning
 * false), even while a fanned-out BACKGROUND child was still genuinely
 * running — a real wire state, not a bug — so the chip froze for the rest
 * of the session. `isPillRefreshTriggerEvent` fixes (a): it is the single
 * source of truth the SSE switch now defers to for which events trigger a
 * refresh. `isPillRefreshArmed` fixes (b): the throttle gate now arms off
 * EITHER the turn running OR any known async task still being non-terminal,
 * not off turn status alone.
 *
 * All three are pure and exported specifically because jsdom has no
 * EventSource — the SSE effect that consumes them never actually runs under
 * this test harness, so the trigger/arm/throttle logic is only reachable as
 * plain functions, not through a live subscription.
 */
import type { Message, SessionAgentTask, SessionMessageEvent } from '@clio/core';
import { describe, expect, it } from 'vitest';
import {
  isPillRefreshArmed,
  isPillRefreshTriggerEvent,
  isTurnRunning,
  PILL_REFRESH_THROTTLE_MS,
  shouldRefreshPillMidTurn,
} from '../../src/session/SessionView';

function assistant(overrides: Partial<Message> = {}): Message {
  return { id: 'm1', role: 'assistant', parts: [], ...overrides } as Message;
}

function task(status: string, overrides: Partial<SessionAgentTask> = {}): SessionAgentTask {
  return { task_id: 't1', status, ...overrides } as SessionAgentTask;
}

function sseEvent(
  type: SessionMessageEvent['type'],
  payload: Record<string, unknown> = {},
): SessionMessageEvent {
  return { type, occurred_at: '', payload };
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

describe('isPillRefreshArmed — armed off the asyncTasks state itself, not just isTurnRunning (round-9 fix)', () => {
  it('is armed while the turn itself is running, regardless of asyncTasks', () => {
    expect(isPillRefreshArmed(true, undefined)).toBe(true);
    expect(isPillRefreshArmed(true, [])).toBe(true);
    expect(isPillRefreshArmed(true, [task('completed')])).toBe(true);
  });

  it('disarms once the turn has ended and no known task is non-terminal', () => {
    expect(isPillRefreshArmed(false, undefined)).toBe(false);
    expect(isPillRefreshArmed(false, [])).toBe(false);
    expect(isPillRefreshArmed(false, [task('completed')])).toBe(false);
  });

  it('stays ARMED after the parent turn ends while a background child is still running — the round-9 fix', () => {
    expect(isPillRefreshArmed(false, [task('running')])).toBe(true);
  });

  it('a MIXED set stays armed — a single non-terminal task is enough, regardless of how many settled', () => {
    expect(
      isPillRefreshArmed(false, [task('completed'), task('running', { task_id: 't2' }), task('failed', { task_id: 't3' })]),
    ).toBe(true);
  });

  it('DISARMS once every known task has gone terminal — full-terminal disarms', () => {
    const whileRunning = [task('running')];
    expect(isPillRefreshArmed(false, whileRunning)).toBe(true);
    const afterSettling = [task('completed')];
    expect(isPillRefreshArmed(false, afterSettling)).toBe(false);
  });

  it('treats failed/cancelled/detached/error the same as completed/done — all terminal', () => {
    for (const status of ['completed', 'failed', 'cancelled', 'detached', 'done', 'error']) {
      expect(isPillRefreshArmed(false, [task(status)])).toBe(false);
    }
  });

  it('is case-insensitive on the wire status string', () => {
    expect(isPillRefreshArmed(false, [task('RUNNING')])).toBe(true);
    expect(isPillRefreshArmed(false, [task('COMPLETED')])).toBe(false);
  });
});

describe('the combined post-turn-end gate — a background child completing after the parent turn settles (round-9 owner finding)', () => {
  it('a background child still running after the parent turn ends keeps the throttled refresh firing', () => {
    // The parent's own turn has already settled (isTurnRunningNow=false) —
    // exactly the state that used to permanently disarm the refresh.
    const runningChild = [task('running')];
    const armed = isPillRefreshArmed(false, runningChild);
    expect(armed).toBe(true);
    expect(shouldRefreshPillMidTurn(armed, 100_000, 0)).toBe(true);
  });

  it('once that child settles too, the SAME gate stops firing — never a refresh with nothing left live', () => {
    const settledChild = [task('completed')];
    const armed = isPillRefreshArmed(false, settledChild);
    expect(armed).toBe(false);
    expect(shouldRefreshPillMidTurn(armed, 100_000, 0)).toBe(false);
  });
});

describe('isPillRefreshTriggerEvent — message.part.added now triggers a refresh (round-9 fix, ~40s first-paint lag)', () => {
  it('message.created always triggers — a new step/turn starting', () => {
    expect(isPillRefreshTriggerEvent(sseEvent('message.created'))).toBe(true);
  });

  it('message.part.added carrying an expert_handoff part triggers — the SPAWN, previously hit `default: break`', () => {
    expect(
      isPillRefreshTriggerEvent(sseEvent('message.part.added', { part: { type: 'expert_handoff' } })),
    ).toBe(true);
  });

  it('message.part.updated carrying an expert_handoff part still triggers — the terminal settle, unchanged', () => {
    expect(
      isPillRefreshTriggerEvent(sseEvent('message.part.updated', { part: { type: 'expert_handoff' } })),
    ).toBe(true);
  });

  it('a non-expert_handoff part.added/part.updated does NOT trigger — plain streamed text stays off the throttle', () => {
    expect(isPillRefreshTriggerEvent(sseEvent('message.part.added', { part: { type: 'text' } }))).toBe(
      false,
    );
    expect(isPillRefreshTriggerEvent(sseEvent('message.part.updated', { part: { type: 'text' } }))).toBe(
      false,
    );
  });

  it('a part.added/part.updated event with no part payload at all does not trigger', () => {
    expect(isPillRefreshTriggerEvent(sseEvent('message.part.added'))).toBe(false);
    expect(isPillRefreshTriggerEvent(sseEvent('message.part.updated'))).toBe(false);
  });

  it('unrelated event types do not trigger here — delta/completed/error/deleted go through their own paths', () => {
    for (const type of [
      'message.part.delta',
      'message.part.completed',
      'message.completed',
      'message.error',
      'message.deleted',
    ] as const) {
      expect(isPillRefreshTriggerEvent(sseEvent(type))).toBe(false);
    }
  });
});
