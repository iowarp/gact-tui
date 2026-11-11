import type { Virtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';

/**
 * The virtualizer can retain an underestimated final row height. Account for
 * its actual bottom in the list height so neither the composer nor following
 * surfaces cover the row, even without detached surfaces.
 */
export function useVirtualizedRowsOverflow({
  messageCount,
  virtualized,
  virtualizer,
  virtualRangeKey,
}: {
  messageCount: number;
  virtualized: boolean;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualRangeKey: string;
}) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [virtualizedRowsOverflow, setVirtualizedRowsOverflow] = useState(0);
  useLayoutEffect(() => {
    if (!virtualized) {
      // Resets the measurement for an unvirtualized list, which has no declared height.
      // oxlint-disable-next-line react/set-state-in-effect
      setVirtualizedRowsOverflow(0);
      return undefined;
    }
    const container = messagesContainerRef.current;
    if (!container) return undefined;
    const recompute = () => {
      const lastChild = container.lastElementChild;
      const lastIndex = messageCount - 1;
      const item = virtualizer.getVirtualItems().find((row) => row.index === lastIndex);
      if (!lastChild || !item || Number(lastChild.getAttribute('data-index')) !== lastIndex) {
        setVirtualizedRowsOverflow(0);
        return;
      }
      // Compare sizes, not positions: a measurement can shrink the total
      // before the rows move, and a transform-only move is never observed,
      // so a position reading would keep a stale gap below the newest turn.
      const underestimate = lastChild.getBoundingClientRect().height - item.size;
      setVirtualizedRowsOverflow(underestimate > 1 ? Math.ceil(underestimate) : 0);
    };
    // The observer reports each target once after the next layout, so the
    // first reading needs no forced layout inside the commit; a streaming row
    // changes the range key with every chunk.
    if (typeof ResizeObserver === 'undefined') {
      recompute();
      return undefined;
    }
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    if (container.lastElementChild) observer.observe(container.lastElementChild);
    return () => observer.disconnect();
  }, [messageCount, virtualRangeKey, virtualized, virtualizer]);
  return { messagesContainerRef, virtualizedRowsOverflow };
}
