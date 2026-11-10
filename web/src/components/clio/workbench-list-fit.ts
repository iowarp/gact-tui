import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

/** A fitted width never exceeds the stored one nor drops under the minimum. */
export function fitWorkbenchWidthTo(width: number, fit: number | undefined, min: number): number {
  return fit === undefined ? width : Math.max(min, Math.min(fit, width));
}

/**
 * The width an element would take with nothing truncated: fixed columns keep
 * their width, truncated text its full length, and a growing flex row the sum
 * of its children rather than the space it was stretched to.
 */
export function naturalWidth(element: HTMLElement): number {
  const style = getComputedStyle(element);
  if (style.display === 'none' || style.position === 'absolute' || style.position === 'fixed')
    return 0;
  const margins = px(style.marginLeft) + px(style.marginRight);
  if (style.textOverflow === 'ellipsis') return element.scrollWidth + margins;
  if (px(style.flexGrow) <= 0) return element.offsetWidth + margins;
  const border = (style_: string, width: string) =>
    style_ === 'none' || style_ === 'hidden' ? 0 : px(width);
  const chrome =
    px(style.paddingLeft) +
    px(style.paddingRight) +
    border(style.borderLeftStyle, style.borderLeftWidth) +
    border(style.borderRightStyle, style.borderRightWidth) +
    margins;
  const children = [...element.children].filter(
    (child): child is HTMLElement => child instanceof HTMLElement,
  );
  if (!children.length) {
    const range = document.createRange();
    range.selectNodeContents(element);
    return Math.ceil(range.getBoundingClientRect().width) + chrome;
  }
  const widths = children.map(naturalWidth).filter((width) => width > 0);
  if (style.display.includes('flex') && !style.flexDirection.startsWith('column')) {
    const gap = px(style.columnGap) * Math.max(0, widths.length - 1);
    return widths.reduce((sum, width) => sum + width, 0) + gap + chrome;
  }
  return Math.max(0, ...widths) + chrome;
}

const FIT_ROWS = '[data-slot="list-row"], [data-slot="workbench-list-header"]';

/**
 * How wide a list must be to show every rendered row untruncated: its widest
 * row's natural width plus that row's inset in the list.
 */
export function listNaturalWidth(list: HTMLElement): number {
  const listWidth = list.getBoundingClientRect().width;
  let widest = 0;
  for (const row of list.querySelectorAll<HTMLElement>(FIT_ROWS)) {
    const inset = listWidth - row.getBoundingClientRect().width;
    widest = Math.max(widest, naturalWidth(row) + Math.max(0, inset));
  }
  return Math.ceil(widest);
}

/**
 * Reports the list's natural width once it lays out and again when its rows
 * change, a frame at a time. The width it reports is what the list needs, and
 * the caller adds whatever chrome sits beside it.
 */
export function useListFitWidth(
  listRef: RefObject<HTMLElement | null>,
  onFit: ((pixels: number, listWidth: number) => void) | undefined,
) {
  const onFitRef = useRef(onFit);
  useLayoutEffect(() => {
    onFitRef.current = onFit;
  });
  const measure = () => {
    const list = listRef.current;
    if (!list || !onFitRef.current) return;
    const width = listNaturalWidth(list);
    if (width > 0) onFitRef.current(width, list.getBoundingClientRect().width);
  };
  // Before paint, so a sparse list never shows at the full share first.
  useLayoutEffect(measure);
  useEffect(() => {
    const list = listRef.current;
    if (!list || typeof MutationObserver === 'undefined') return;
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    });
    observer.observe(list, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRef]);
}
