import { useEffect, useState, type RefObject } from 'react';

/** How far beyond the visible part of the page an element counts as seen, ahead of scrolling. */
const READ_AHEAD_MARGIN = '600px 0px';

const EVERYTHING: Pick<ReadonlySet<string>, 'has'> = { has: () => true };

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return null;
}

/**
 * The values of `attribute` (a `data-*` attribute) on elements inside `container` that have
 * come near the visible part of the page. Once seen, a value stays seen, so whatever it
 * loads is read once and kept. Without an observer (non-browser renderers) everything
 * counts as seen.
 *
 * `layout` changes whenever the observed elements may have been replaced (a new filter or
 * list), so new elements are observed.
 */
export function useSeenInView(
  container: RefObject<HTMLElement | null>,
  attribute: `data-${string}`,
  layout: string,
): Pick<ReadonlySet<string>, 'has'> {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const observable = typeof IntersectionObserver !== 'undefined';
  useEffect(() => {
    const root = container.current;
    if (!root || !observable) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hits = entries.flatMap((entry) =>
          entry.isIntersecting ? [entry.target.getAttribute(attribute) ?? ''] : [],
        );
        setSeen((current) =>
          hits.every((hit) => !hit || current.has(hit))
            ? current
            : new Set([...current, ...hits.filter(Boolean)]),
        );
      },
      { root: scrollParent(root), rootMargin: READ_AHEAD_MARGIN },
    );
    root.querySelectorAll(`[${attribute}]`).forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [attribute, container, layout, observable]);
  return observable ? seen : EVERYTHING;
}
