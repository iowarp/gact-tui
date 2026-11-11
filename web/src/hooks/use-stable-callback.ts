import { useCallback, useLayoutEffect, useRef, useState } from 'react';

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

/**
 * `props` with each function replaced by a stable one that calls the latest
 * value, so a memoized child re-renders only when its data changes. A handler
 * that comes and goes (undefined, then a function) keeps that presence.
 */
export function useStableHandlers<Props extends object>(props: Props): Props {
  // One mutable box per mount: the latest props, and a handler per key that reads them.
  const [box] = useState(() => ({
    latest: props as object,
    handlers: new Map<string, (...args: unknown[]) => unknown>(),
  }));
  useLayoutEffect(() => {
    // oxlint-disable-next-line react/immutability -- a per-mount box the handlers read at call time.
    box.latest = props;
  });
  return Object.fromEntries(
    Object.entries(props).map(([key, value]) => {
      if (typeof value !== 'function') return [key, value];
      let handler = box.handlers.get(key);
      if (!handler) {
        handler = (...args: unknown[]) =>
          (box.latest as Record<string, ((...args: unknown[]) => unknown) | undefined>)[key]?.(
            ...args,
          );
        box.handlers.set(key, handler);
      }
      return [key, handler];
    }),
  ) as Props;
}
