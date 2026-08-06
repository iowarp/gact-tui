/**
 * Pure history-state helpers for the center reading pane's back/forward
 * navigation (owner 2026-08-06: "the prototype wires popstate for back/
 * forward through views"). Kept free of React and the DOM `history`/
 * `window` globals so the reducer and the scroll-map bookkeeping are
 * unit-testable without a browser — SessionView owns the only calls into
 * `window.history`/`popstate` itself; this module only ever hands it a
 * plain, serializable state to push/replace, and reads one back.
 *
 * "The center" is whichever session the reading pane currently shows: the
 * active session (`activeId`, changed by a rail click or an observability
 * agent-jump) or, drilled on top of it, a child (`focus`, changed by a
 * Call-box click or the breadcrumb ribbon). Both dimensions travel
 * together in one `NavHistoryState` payload so a single `popstate`
 * restores both in one shot — see `apply-without-repush` in the test file
 * for why that matters (a `popstate` must never itself call `pushState`).
 */

export interface FocusEntry {
  sessionId: string;
  agent: string;
}

export interface NavHistoryState {
  /** The session shown when `focus` is empty. Null before any session is
   *  selected. */
  activeId: string | null;
  /** The drilled-into child stack on top of `activeId`, outermost first —
   *  mirrors SessionView's own `focus` state shape exactly. */
  focus: FocusEntry[];
  /** Every visited view's last-known transcript scrollTop, keyed by
   *  `scrollKeyFor`. Carried on every entry (not just the adjacent one) so
   *  a popstate several steps away still finds its remembered position. */
  scroll: Record<string, number>;
}

/** This module's own history entries are marked so a `popstate` fired by
 *  some unrelated history user (a future router, a browser-restored blank
 *  entry) is never mistaken for one of these and misapplied. */
const MARK = 'clio.center-nav' as const;

interface WireNavHistoryState {
  [MARK]: true;
  value: NavHistoryState;
}

export function emptyNavHistoryState(activeId: string | null = null): NavHistoryState {
  return { activeId, focus: [], scroll: {} };
}

/** Wrap a state for `history.pushState`/`replaceState`. */
export function wrapNavHistoryState(value: NavHistoryState): WireNavHistoryState {
  return { [MARK]: true, value };
}

/** Unwrap `popstate.state` (or any `history.state` read). Returns null for
 *  anything not carrying our mark — including the browser's own initial
 *  blank entry — so callers can tell "not ours" (ignore) from "ours" (an
 *  entry with no visited views yet, still a real `NavHistoryState`).
 *  Tolerant of a malformed/foreign shape at every field: a corrupt entry
 *  degrades to empty arrays/objects rather than throwing. */
export function readNavHistoryState(raw: unknown): NavHistoryState | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<WireNavHistoryState>;
  if (candidate[MARK] !== true || !candidate.value || typeof candidate.value !== 'object') {
    return null;
  }
  const value = candidate.value as Partial<NavHistoryState>;
  const focus: FocusEntry[] = Array.isArray(value.focus)
    ? value.focus.filter(
        (entry): entry is FocusEntry =>
          !!entry &&
          typeof entry === 'object' &&
          typeof (entry as FocusEntry).sessionId === 'string' &&
          typeof (entry as FocusEntry).agent === 'string',
      )
    : [];
  const rawScroll = value.scroll;
  const scroll: Record<string, number> =
    rawScroll && typeof rawScroll === 'object' && !Array.isArray(rawScroll)
      ? Object.fromEntries(
          Object.entries(rawScroll as Record<string, unknown>).filter(
            (pair): pair is [string, number] => typeof pair[1] === 'number',
          ),
        )
      : {};
  return {
    activeId: typeof value.activeId === 'string' ? value.activeId : null,
    focus,
    scroll,
  };
}

/** The scroll-map key for a point in the nav tree: the focused child's
 *  session id when drilled in, otherwise the active session id itself (or
 *  the 'idle' sentinel pre-session) — session ids are unique, so distinct
 *  children never collide and switching sessions never reuses a stale
 *  position. */
export function scrollKeyFor(activeId: string | null, focus: FocusEntry[]): string {
  const top = focus.length > 0 ? focus[focus.length - 1] : undefined;
  if (top) return top.sessionId;
  return activeId ?? 'idle';
}

/** Pure scroll-map write — returns the SAME map when the value is
 *  unchanged, so callers that key an effect off map identity don't refire
 *  for a no-op record. */
export function recordScroll(
  scroll: Record<string, number>,
  key: string,
  value: number,
): Record<string, number> {
  if (scroll[key] === value) return scroll;
  return { ...scroll, [key]: value };
}

/** Pure scroll-map read — 0 (top) for a view never visited before. */
export function lookupScroll(scroll: Record<string, number>, key: string): number {
  return scroll[key] ?? 0;
}

/** Append a child focus entry — the push half of the focus reducer
 *  (Call-box click). Pure: returns a new array, never mutates `focus`. */
export function pushFocusEntry(focus: FocusEntry[], entry: FocusEntry): FocusEntry[] {
  return [...focus, entry];
}

/** Truncate the stack back to (and including) index `at` — the breadcrumb
 *  ribbon's own semantics (`focus.slice(0, at + 1)`); `at < 0` clears to
 *  the root ('main'). Pure. */
export function truncateFocusAt(focus: FocusEntry[], at: number): FocusEntry[] {
  if (at < 0) return [];
  return focus.slice(0, at + 1);
}

/**
 * Build the NEXT `NavHistoryState` for a user-initiated center navigation
 * (Call-box push, breadcrumb pop/root, an obs agent-jump) — the pure half
 * of SessionView's `navigateCenter`. Records the view being LEFT under its
 * own scroll-map key before switching, so scrolling back to it later (via
 * `popstate`) finds where the user left it.
 *
 * This is the ONLY function in this module that produces a state meant for
 * `pushState`/`replaceState`. A `popstate` handler must never call it —
 * it already has the state it needs verbatim from `readNavHistoryState`
 * (see the `apply-without-repush` tests): re-deriving and re-pushing from
 * a popped state is exactly the loop this module is designed to avoid.
 */
export function nextNavHistoryState(
  current: NavHistoryState,
  next: { activeId: string | null; focus: FocusEntry[] },
  leavingScrollTop: number,
): NavHistoryState {
  const leavingKey = scrollKeyFor(current.activeId, current.focus);
  const scroll = recordScroll(current.scroll, leavingKey, leavingScrollTop);
  return { activeId: next.activeId, focus: next.focus, scroll };
}
