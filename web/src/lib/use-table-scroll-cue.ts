import { useEffect, type RefObject } from 'react';

/** Wide tables scroll in place: a thin visible scrollbar and a right-edge fade while more columns follow. */
export const TABLE_SCROLL_CUE_CLASS_NAME =
  '[&_[data-table-scroll]]:[scrollbar-width:thin] [&_[data-table-scroll]]:[scrollbar-color:color-mix(in_oklch,var(--muted-foreground)_36%,transparent)_transparent] [&_[data-scroll-more]]:[mask-image:linear-gradient(to_left,transparent,#000_32px)]';

/** Marks each rendered table's scroller while columns remain to its right. */
export function useTableScrollCue(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const watched = new Map<HTMLElement, () => void>();
    const update = (scroller: HTMLElement) =>
      scroller.toggleAttribute(
        'data-scroll-more',
        scroller.scrollWidth - scroller.clientWidth - scroller.scrollLeft > 1,
      );
    const resize =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver((entries) => {
            for (const entry of entries) {
              const target = entry.target as HTMLElement;
              const scroller = target.tagName === 'TABLE' ? target.parentElement : target;
              if (scroller) update(scroller);
            }
          });
    const scan = () => {
      for (const table of element.querySelectorAll('table')) {
        const scroller = table.parentElement;
        if (!scroller || watched.has(scroller)) continue;
        scroller.setAttribute('data-table-scroll', '');
        const onScroll = () => update(scroller);
        scroller.addEventListener('scroll', onScroll, { passive: true });
        resize?.observe(scroller);
        resize?.observe(table);
        watched.set(scroller, () => scroller.removeEventListener('scroll', onScroll));
        update(scroller);
      }
    };
    scan();
    const mutations = new MutationObserver(scan);
    mutations.observe(element, { childList: true, subtree: true });
    return () => {
      mutations.disconnect();
      resize?.disconnect();
      for (const stop of watched.values()) stop();
    };
  }, [root]);
}
