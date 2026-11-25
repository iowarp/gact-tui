import { useEffect, useState } from 'react';

/** True once `active` has held for `delayMs`; false as soon as it drops. */
export function useHeldFlag(active: boolean, delayMs: number): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => setHeld(true), delayMs);
    return () => {
      window.clearTimeout(timer);
      setHeld(false);
    };
  }, [active, delayMs]);
  return active && held;
}
