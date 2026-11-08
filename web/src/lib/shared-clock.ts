import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';

/**
 * One clock for every elapsed-time readout. Each subscriber used to own a
 * `setInterval`, so a running conversation woke the page several times a
 * second, re-rendered each subtree on its own tick and kept going in a hidden
 * tab. This clock runs one timer aligned to the second (subscribers re-render
 * in the same task), only while something subscribes, and pauses while the
 * document is hidden.
 */
type Listener = () => void;

const listeners = new Map<number, Set<Listener>>();
const timers = new Map<number, number>();
const snapshots = new Map<number, number>();

function documentHidden(): boolean {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

function tick(periodMs: number): void {
  snapshots.set(periodMs, Date.now());
  for (const listener of [...(listeners.get(periodMs) ?? [])]) listener();
}

function schedule(periodMs: number): void {
  if (timers.has(periodMs) || documentHidden() || !listeners.get(periodMs)?.size) return;
  // Align to the period so every readout of the same second changes together.
  const delay = periodMs - (Date.now() % periodMs) || periodMs;
  const timeout = window.setTimeout(() => {
    timers.delete(periodMs);
    tick(periodMs);
    schedule(periodMs);
  }, delay);
  timers.set(periodMs, timeout);
}

function stop(periodMs: number): void {
  const timer = timers.get(periodMs);
  if (timer !== undefined) window.clearTimeout(timer);
  timers.delete(periodMs);
}

let visibilityBound = false;
function bindVisibility(): void {
  if (visibilityBound || typeof document === 'undefined') return;
  visibilityBound = true;
  document.addEventListener('visibilitychange', () => {
    for (const periodMs of listeners.keys()) {
      if (documentHidden()) {
        stop(periodMs);
      } else {
        // Catch up at once on return rather than showing a stale value for a tick.
        tick(periodMs);
        schedule(periodMs);
      }
    }
  });
}

function subscribe(periodMs: number, listener: Listener): () => void {
  bindVisibility();
  let set = listeners.get(periodMs);
  if (!set) {
    set = new Set();
    listeners.set(periodMs, set);
  }
  set.add(listener);
  if (!snapshots.has(periodMs)) snapshots.set(periodMs, Date.now());
  schedule(periodMs);
  return () => {
    set.delete(listener);
    if (set.size === 0) {
      stop(periodMs);
      listeners.delete(periodMs);
      snapshots.delete(periodMs);
    }
  };
}

/** True while `target` (when given) intersects the viewport; true without a target. */
function useOnScreen(target: RefObject<Element | null> | undefined, enabled: boolean): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = target?.current;
    if (!enabled || !element || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries.at(-1);
      if (entry) setOnScreen(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, target]);
  return onScreen || !target;
}

export interface SharedNowOptions {
  /** Tick period. Unit: milliseconds. */
  periodMs?: number;
  /** Stop ticking while this element is scrolled out of view. */
  target?: RefObject<Element | null>;
}

/**
 * The current time, refreshed by the shared clock while `ticking` (and, with a
 * `target`, while it is on screen). Not ticking returns the time of the last
 * render, so a finished duration stops re-rendering.
 */
export function useSharedNow(ticking: boolean, options: SharedNowOptions = {}): number {
  const periodMs = options.periodMs ?? 1_000;
  const onScreen = useOnScreen(options.target, ticking);
  const active = ticking && onScreen;
  const [mountedAt] = useState(Date.now);
  const [stoppedAt, setStoppedAt] = useState<number>();
  const wasActive = useRef(active);
  useEffect(() => {
    // Freeze at the moment ticking stops, not at mount time.
    // oxlint-disable-next-line react/set-state-in-effect
    if (wasActive.current && !active) setStoppedAt(Date.now());
    wasActive.current = active;
  }, [active]);
  const subscribeActive = useCallback(
    (listener: Listener) => (active ? subscribe(periodMs, listener) : () => undefined),
    [active, periodMs],
  );
  const now = useSyncExternalStore(subscribeActive, () =>
    active ? (snapshots.get(periodMs) ?? mountedAt) : (stoppedAt ?? mountedAt),
  );
  return Math.max(now, mountedAt);
}

/** Test seam: drop every subscription and timer. */
export function resetSharedClock(): void {
  for (const periodMs of [...timers.keys()]) stop(periodMs);
  listeners.clear();
  snapshots.clear();
}
