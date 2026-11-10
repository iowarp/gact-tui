import { useEffect, useRef, useState } from 'react';

/**
 * The element's content width, so a toolbar can fold labels to icons when it is
 * narrow. 0 until measured (and without ResizeObserver), so callers stay unfolded.
 */
export function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const node = ref.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Whether a measured width is below `limit`; unmeasured counts as wide. */
export const narrowerThan = (width: number, limit: number) => width > 0 && width < limit;
