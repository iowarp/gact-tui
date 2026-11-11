import { useEffect, useState, useSyncExternalStore } from 'react';

/*
 * A live refresh can reorder the left bar, move a row to another day or past
 * "Show N more", and so remount it under its open menu or slide the menu under
 * a still pointer. While a row's menu is open the rail keeps the lists it had.
 */
let holds = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Holds the rail's lists while `open`; releases on close or unmount. */
export function useHoldRailWhile(open: boolean) {
  useEffect(() => {
    if (!open) return;
    holds += 1;
    notify();
    return () => {
      holds -= 1;
      notify();
    };
  }, [open]);
}

export function useRailHeld(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => holds > 0,
    () => false,
  );
}

/** The value as it was when `held` began; the live one otherwise. */
export function useHeldValue<T>(value: T, held: boolean): T {
  const [kept, setKept] = useState(value);
  if (!held && kept !== value) setKept(value);
  return held ? kept : value;
}
