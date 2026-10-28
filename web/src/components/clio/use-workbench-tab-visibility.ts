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
      else if (tab.right > right) {
        strip.scrollLeft += tab.right - right;
        hideClippedLeadingTab(left, active);
      }
    };

    // Scrolling right by the overflow leaves the tab before it cut mid-word at the
    // left edge ("servability"). Scroll on past that tab when the selected one still fits.
    const hideClippedLeadingTab = (left: number, selected: HTMLElement) => {
      for (const sibling of Array.from(selected.parentElement?.children ?? [])) {
        const box = sibling.getBoundingClientRect();
        if (box.left >= left || box.right <= left) continue;
        const shift = box.right - left;
        if (selected.getBoundingClientRect().left - shift >= left) strip.scrollLeft += shift;
        return;
      }
    };

    // Tabs scrolled off the left edge fade out there instead of reading as a cut label.
    const markScrolled = () => {
      strip.dataset.scrolledStart = strip.scrollLeft > 0 ? 'true' : 'false';
    };
    const revealAndMark = () => {
      reveal();
      markScrolled();
    };

    revealAndMark();
    strip.addEventListener('scroll', markScrolled, { passive: true });
    const observer = new ResizeObserver(revealAndMark);
    observer.observe(strip);
    observer.observe(active);
    if (active.parentElement) observer.observe(active.parentElement);
    // Sortable moves reordered tabs with a transform after this layout effect.
    // Transforms do not resize the element, so reveal its final position too.
    const settled = (event: TransitionEvent) => {
      if (event.target === active && event.propertyName === 'transform') revealAndMark();
    };
    active.addEventListener('transitionend', settled);
    active.addEventListener('transitioncancel', settled);
    return () => {
      observer.disconnect();
      strip.removeEventListener('scroll', markScrolled);
      active.removeEventListener('transitionend', settled);
      active.removeEventListener('transitioncancel', settled);
    };
  }, [stripRef, activeTabRef, activeTabId, tabs, maximized]);
}
