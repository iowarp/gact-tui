import { useLayoutEffect, type RefObject } from 'react';

/**
 * Marks a capped scroll region `data-clipped` while content remains below its edge.
 * Pass `mounted` when the region renders conditionally, so the hook attaches once it exists.
 */
export function useScrollClipped(ref: RefObject<HTMLElement | null>, mounted?: boolean) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      const clipped = element.scrollTop + element.clientHeight < element.scrollHeight - 1;
      element.toggleAttribute('data-clipped', clipped);
    };
    update();
    element.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    for (const child of element.children) observer?.observe(child);
    return () => {
      element.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [ref, mounted]);
}

/**
 * Marks `data-overflows` while the element has content to scroll. Overscroll containment keys on
 * it: a scroller with nothing to scroll that still contains overscroll swallows the wheel instead
 * of passing it to the scroller around it.
 */
export function useOverflowMark(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () =>
      element.toggleAttribute('data-overflows', element.scrollHeight > element.clientHeight + 1);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const resize = new ResizeObserver(update);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(element);
      for (const child of element.children) resize.observe(child);
      update();
    };
    observeChildren();
    const children = new MutationObserver(observeChildren);
    children.observe(element, { childList: true });
    return () => {
      resize.disconnect();
      children.disconnect();
    };
  }, [ref]);
}
