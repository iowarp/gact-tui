import { useEffect, useState, type RefObject } from 'react';

/**
 * The canvas's laid-out size, re-measured whenever it changes, so a canvas view
 * redraws at its real size. `ready` is true once the canvas is mounted (views mount
 * it only when their data has arrived); the effect re-attaches when it changes.
 */
export function useCanvasSize(
  ref: RefObject<HTMLCanvasElement | null>,
  ready: boolean,
): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node || !ready || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry)
        setSize({
          width: Math.round(entry.contentRect.width),
          height: Math.round(entry.contentRect.height),
        });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, ready]);
  return size;
}
