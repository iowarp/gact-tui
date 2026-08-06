/**
 * Pure history-state reducer + scroll-map bookkeeping for the center
 * reading pane's back/forward navigation (SessionView's `navHistory.ts`).
 * These are DOM-free — SessionView is the only place that ever touches
 * `window.history`/`popstate`; the live probe (screenshots/nav-history/)
 * covers that browser-level wiring end to end.
 */
import { describe, expect, it } from 'vitest';
import {
  emptyNavHistoryState,
  lookupScroll,
  nextNavHistoryState,
  pushFocusEntry,
  readNavHistoryState,
  recordScroll,
  scrollKeyFor,
  truncateFocusAt,
  wrapNavHistoryState,
  type FocusEntry,
  type NavHistoryState,
} from '../../src/session/navHistory';

describe('focus stack reducer', () => {
  it('pushFocusEntry appends without mutating the input', () => {
    const focus: FocusEntry[] = [{ sessionId: 's1', agent: 'hpc' }];
    const out = pushFocusEntry(focus, { sessionId: 's2', agent: 'data' });
    expect(out).toEqual([
      { sessionId: 's1', agent: 'hpc' },
      { sessionId: 's2', agent: 'data' },
    ]);
    expect(focus).toEqual([{ sessionId: 's1', agent: 'hpc' }]); // unmutated
  });

  it('truncateFocusAt keeps entries through index `at` inclusive', () => {
    const focus: FocusEntry[] = [
      { sessionId: 's1', agent: 'a' },
      { sessionId: 's2', agent: 'b' },
      { sessionId: 's3', agent: 'c' },
    ];
    expect(truncateFocusAt(focus, 1)).toEqual([
      { sessionId: 's1', agent: 'a' },
      { sessionId: 's2', agent: 'b' },
    ]);
  });

  it('truncateFocusAt(-1) clears to the root (the "main" crumb)', () => {
    const focus: FocusEntry[] = [{ sessionId: 's1', agent: 'a' }];
    expect(truncateFocusAt(focus, -1)).toEqual([]);
  });
});

describe('scroll-map bookkeeping', () => {
  it('lookupScroll defaults to 0 (top) for a never-visited key', () => {
    expect(lookupScroll({}, 'main')).toBe(0);
  });

  it('recordScroll writes a new key without mutating the input map', () => {
    const map = { main: 100 };
    const out = recordScroll(map, 'child_1', 250);
    expect(out).toEqual({ main: 100, child_1: 250 });
    expect(map).toEqual({ main: 100 }); // unmutated
  });

  it('recordScroll returns the SAME map reference for a no-op write', () => {
    const map = { main: 100 };
    expect(recordScroll(map, 'main', 100)).toBe(map);
  });

  it('scrollKeyFor: the focused child (top of stack) when drilled in', () => {
    const focus: FocusEntry[] = [
      { sessionId: 'child_1', agent: 'hpc' },
      { sessionId: 'child_2', agent: 'data' },
    ];
    expect(scrollKeyFor('main_sess', focus)).toBe('child_2');
  });

  it('scrollKeyFor: the active session id when focus is empty', () => {
    expect(scrollKeyFor('main_sess', [])).toBe('main_sess');
  });

  it('scrollKeyFor: the idle sentinel pre-session', () => {
    expect(scrollKeyFor(null, [])).toBe('idle');
  });
});

describe('nextNavHistoryState (the push/pop reducer)', () => {
  it('push: records the LEAVING view scroll, advances focus by one', () => {
    const current = emptyNavHistoryState('main_sess');
    const next = nextNavHistoryState(current, { activeId: 'main_sess', focus: [{ sessionId: 'child_1', agent: 'hpc' }] }, 340);
    expect(next.focus).toEqual([{ sessionId: 'child_1', agent: 'hpc' }]);
    // The view being left (main, since focus was []) kept its scroll.
    expect(next.scroll).toEqual({ main_sess: 340 });
  });

  it('pop: records the child scroll being left, returns to a shorter stack', () => {
    const current: NavHistoryState = {
      activeId: 'main_sess',
      focus: [{ sessionId: 'child_1', agent: 'hpc' }],
      scroll: { main_sess: 340 },
    };
    const next = nextNavHistoryState(current, { activeId: 'main_sess', focus: [] }, 900);
    expect(next.focus).toEqual([]);
    // child_1's own position (900) is now on record too, main_sess's
    // earlier 340 survives untouched (not overwritten by this transition).
    expect(next.scroll).toEqual({ main_sess: 340, child_1: 900 });
  });

  it('an obs agent-jump (activeId change) resets focus and keys scroll by the new active id', () => {
    const current: NavHistoryState = { activeId: 'sess_a', focus: [], scroll: { sess_a: 50 } };
    const next = nextNavHistoryState(current, { activeId: 'sess_b', focus: [] }, 50);
    expect(next.activeId).toBe('sess_b');
    expect(next.focus).toEqual([]);
    expect(next.scroll).toEqual({ sess_a: 50 });
  });

  it('a multi-step push/pop/push sequence accumulates a full scroll map', () => {
    let state = emptyNavHistoryState('main_sess');
    state = nextNavHistoryState(state, { activeId: 'main_sess', focus: [{ sessionId: 'c1', agent: 'a' }] }, 100); // leave main@100
    state = nextNavHistoryState(
      state,
      { activeId: 'main_sess', focus: [{ sessionId: 'c1', agent: 'a' }, { sessionId: 'c2', agent: 'b' }] },
      500,
    ); // leave c1@500
    state = nextNavHistoryState(state, { activeId: 'main_sess', focus: [{ sessionId: 'c1', agent: 'a' }] }, 700); // leave c2@700, back to c1
    expect(state.scroll).toEqual({ main_sess: 100, c1: 500, c2: 700 });
    expect(state.focus).toEqual([{ sessionId: 'c1', agent: 'a' }]);
    // Restoring c1 now reads back exactly what was left there earlier.
    expect(lookupScroll(state.scroll, scrollKeyFor(state.activeId, state.focus))).toBe(500);
  });
});

describe('wrap / read round-trip (popstate applies without re-pushing)', () => {
  it('round-trips a full state through wrap -> read', () => {
    const state: NavHistoryState = {
      activeId: 'main_sess',
      focus: [{ sessionId: 'c1', agent: 'hpc' }],
      scroll: { main_sess: 120, c1: 40 },
    };
    const read = readNavHistoryState(wrapNavHistoryState(state));
    expect(read).toEqual(state);
  });

  it('a popstate handler only ever needs to READ the popped state — proving', () => {
    // This test documents the "apply-without-repush" invariant: applying a
    // popped state is a pure unwrap, never a call back into
    // nextNavHistoryState/wrapNavHistoryState. If a popstate handler needed
    // to re-derive the state it would risk re-pushing and creating a loop;
    // readNavHistoryState hands back everything needed to apply directly.
    const pushed = wrapNavHistoryState({
      activeId: 'main_sess',
      focus: [],
      scroll: { main_sess: 10 },
    });
    const applied = readNavHistoryState(pushed);
    expect(applied).not.toBeNull();
    // Nothing beyond a plain read was required to reach a valid, directly
    // applicable NavHistoryState.
    expect(applied).toEqual({ activeId: 'main_sess', focus: [], scroll: { main_sess: 10 } });
  });

  it('returns null for a foreign/unrelated history.state (never misapplied)', () => {
    expect(readNavHistoryState(null)).toBeNull();
    expect(readNavHistoryState(undefined)).toBeNull();
    expect(readNavHistoryState('a plain string state')).toBeNull();
    expect(readNavHistoryState({ someOtherRouter: true })).toBeNull();
  });

  it('degrades a malformed value gracefully instead of throwing', () => {
    const malformed = wrapNavHistoryState({
      activeId: 123 as unknown as string,
      focus: 'not-an-array' as unknown as FocusEntry[],
      scroll: null as unknown as Record<string, number>,
    });
    expect(readNavHistoryState(malformed)).toEqual({ activeId: null, focus: [], scroll: {} });
  });

  it('filters out malformed focus entries and non-numeric scroll values', () => {
    const malformed = wrapNavHistoryState({
      activeId: 'main_sess',
      focus: [
        { sessionId: 'c1', agent: 'ok' },
        { sessionId: 'c2' } as unknown as FocusEntry,
        null as unknown as FocusEntry,
      ],
      scroll: { main_sess: 10, bogus: 'nope' as unknown as number },
    });
    expect(readNavHistoryState(malformed)).toEqual({
      activeId: 'main_sess',
      focus: [{ sessionId: 'c1', agent: 'ok' }],
      scroll: { main_sess: 10 },
    });
  });
});
