import { useLayoutEffect, type RefObject } from 'react';

/** Keep the selected tab and its close affordance inside the resized strip. */
export function useWorkbenchTabVisibility(
  stripRef: RefObject<HTMLDivElement | null>,
  activeTabRef: RefObject<HTMLDivElement | null>,
  activeTabId: string,
  tabs: readonly { id: string; label: string }[],
  maximized: boolean,
): void {
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const active = activeTabRef.current;
    if (!strip || !active) return;

    const reveal = () => {
      if (strip.clientWidth === 0) return;
      const viewport = strip.getBoundingClientRect();
      const tab = active.getBoundingClientRect();
      const left = viewport.left + strip.clientLeft;
      const right = left + strip.clientWidth;
      // A tab wider than the viewport can only expose its leading edge.
      if (tab.width > strip.clientWidth || tab.left < left) strip.scrollLeft += tab.left - left;
      else if (tab.right > right) strip.scrollLeft += tab.right - right;
    };

    reveal();
    const observer = new ResizeObserver(reveal);
    observer.observe(strip);
    observer.observe(active);
    if (active.parentElement) observer.observe(active.parentElement);
    return () => observer.disconnect();
  }, [stripRef, activeTabRef, activeTabId, tabs, maximized]);
}
