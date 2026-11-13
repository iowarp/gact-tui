import { interfaceScale } from '@/theme/runtime';

// Widths drawn by NavTabs' classes: a closed tab is 7 + 14 + 7, plus the 2px gap;
// the open tab adds its name, the 6px icon gap and 10px right padding. Px at the
// default interface size; scaled by it, as the rem icons and gaps grow.
export const CLOSED_TAB = 30;
export const OPEN_TAB_CHROME = 37;
export const LIST_TRIGGER = 44;

/** The open tab's name on one line, even while it is drawn wrapped. */
export function oneLineWidth(name: HTMLElement) {
  const previous = name.style.whiteSpace;
  name.style.whiteSpace = 'nowrap';
  const width = name.scrollWidth;
  name.style.whiteSpace = previous;
  return width;
}

/**
 * The width a strip needs to show its open tab's whole name on one line with every
 * closed tab folded into the list, so the page can give it room before the name wraps.
 */
export function navTabsMinWidth(nav: HTMLElement) {
  const name = nav.querySelector<HTMLElement>('[data-tab-name]');
  if (!name) return 0;
  const scale = interfaceScale();
  const folded = nav.querySelectorAll('a').length > 1 || nav.querySelector('[data-tab-list]');
  return OPEN_TAB_CHROME * scale + oneLineWidth(name) + 1 + (folded ? LIST_TRIGGER * scale : 0);
}
