import { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * A function whose identity never changes but which always calls the latest
 * `callback`. For handlers passed to memoized children that must not re-render
 * when the parent does. Call it from events, not during render.
 */
export function useStableCallback<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  const latest = useRef(callback);
  useLayoutEffect(() => {
    latest.current = callback;
  });
  return useCallback((...args: Args) => latest.current(...args), []);
}
