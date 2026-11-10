import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

function px(value: string): number {
  const number = Number.parseFloat(value);
  return Number.isFinite(number) ? number : 0;
}

/** A fitted width never exceeds the stored one nor drops under the minimum. */
export function fitWorkbenchWidthTo(width: number, fit: number | undefined, min: number): number {
  return fit === undefined ? width : Math.max(min, Math.min(fit, width));
}

/** The laid-out extent of an element's contents, clipped or not (0 where there is no layout). */
function contentWidth(element: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(element);
  if (typeof range.getBoundingClientRect !== 'function') return 0;
  return Math.ceil(range.getBoundingClientRect().width);
}

/**
 * The width an element would take with nothing truncated: fixed columns keep
 * their width, truncated text its full length, and a growing flex row the sum
 * of its children rather than the space it was stretched to. A `stretched`
 * element (a row, or a block inside a block) is measured by its content too;
 * a `root` one is measured even when it is absolutely placed (a virtual row).
 */
export function naturalWidth(element: HTMLElement, stretched = false, root = false): number {
  const style = getComputedStyle(element);
  if (style.display === 'none') return 0;
  if (!root && (style.position === 'absolute' || style.position === 'fixed')) return 0;
  const margins = px(style.marginLeft) + px(style.marginRight);
  if (style.textOverflow === 'ellipsis') {
    // scrollWidth is the box when the text is shorter than a grown cell; the
    // text's own extent is the content.
    const text = contentWidth(element);
    return (
      (text > 0 ? text + px(style.paddingLeft) + px(style.paddingRight) : element.scrollWidth) +
      margins
    );
  }
  if (!stretched && px(style.flexGrow) <= 0) return element.offsetWidth + margins;
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
  if (!children.length) return contentWidth(element) + chrome;
  if (style.display.includes('flex') && !style.flexDirection.startsWith('column')) {
    const widths = children.map((child) => naturalWidth(child)).filter((width) => width > 0);
    const gap = px(style.columnGap) * Math.max(0, widths.length - 1);
    return widths.reduce((sum, width) => sum + width, 0) + gap + chrome;
  }
  // Block and column children stretch across the element: measure their content.
  const widths = children.map((child) => naturalWidth(child, true));
  return Math.max(0, ...widths) + chrome;
}

const FIT_ROWS = '[data-slot="list-row"], [data-slot="workbench-list-header"], [role="treeitem"]';

/**
 * How wide a list must be to show every rendered row untruncated: its widest
 * row's natural width plus that row's inset in the list.
 */
export function listNaturalWidth(list: HTMLElement): number {
  const listWidth = list.getBoundingClientRect().width;
  let widest = 0;
  for (const row of list.querySelectorAll<HTMLElement>(FIT_ROWS)) {
    const inset = listWidth - row.getBoundingClientRect().width;
    widest = Math.max(widest, naturalWidth(row, true, true) + Math.max(0, inset));
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
    // A list in a hidden tab has no width and nothing to fit.
    const listWidth = list.getBoundingClientRect().width;
    if (listWidth <= 0) return;
    const width = listNaturalWidth(list);
    if (width > 0) onFitRef.current(width, listWidth);
  };
  // Before paint, so a sparse list never shows at the full share first.
  useLayoutEffect(measure);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    // Rows change, or the list is shown (a tab becomes active) and gets its width.
    const mutations =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(schedule);
    mutations?.observe(list, { childList: true, subtree: true, characterData: true });
    const resizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizes?.observe(list);
    return () => {
      mutations?.disconnect();
      resizes?.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listRef]);
}
