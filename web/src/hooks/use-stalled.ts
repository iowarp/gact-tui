import { useEffect, useState } from 'react';
import { LOAD_STALL_MS } from '@/lib/runtime-limits';

/** Whether `waiting` has held for `limitMs` without a break. */
export function useStalled(waiting: boolean, limitMs: number = LOAD_STALL_MS): boolean {
  const [stalled, setStalled] = useState(false);
  const [wasWaiting, setWasWaiting] = useState(waiting);
  // The wait ended or started over: clear the flag during render.
  if (wasWaiting !== waiting) {
    setWasWaiting(waiting);
    if (stalled) setStalled(false);
  }
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setStalled(true), limitMs);
    return () => window.clearTimeout(timer);
  }, [waiting, limitMs]);
  return waiting && stalled;
}
