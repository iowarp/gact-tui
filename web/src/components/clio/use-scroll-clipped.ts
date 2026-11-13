import { useLayoutEffect, type RefObject } from 'react';

/** Marks a capped scroll region `data-clipped` while content remains below its edge. */
export function useScrollClipped(ref: RefObject<HTMLElement | null>) {
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
  }, [ref]);
}
