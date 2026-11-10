import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * A function with one identity for the component's lifetime that always calls the
 * latest `handler`, so a memoized child is not re-rendered by a fresh closure.
 * Call it from events and effects, never during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  handler: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(handler);
  useInsertionEffect(() => {
    latest.current = handler;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
