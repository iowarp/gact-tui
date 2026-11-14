import { interfaceScale } from '@/theme/runtime';

// Widths drawn by NavTabs' classes: a closed tab is 7 + 14 + 7, plus the 2px gap;
// the open tab adds its name, the 6px icon gap and 10px right padding. Px at the
// default interface size; scaled by it, as the rem icons and gaps grow.
export const CLOSED_TAB = 30;
export const OPEN_TAB_CHROME = 37;
/** The open tab's 14px icon and its 6px gap, which give way to a long word. */
export const OPEN_TAB_ICON = 20;
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
 * The narrowest the open tab's name may wrap to: its longest word, or 4em where words
 * are short (CJK), and never wider than its one-line width. Below this a name breaks
 * letter by letter.
 */
export function nameFloor(name: HTMLElement) {
  const { minWidth, width } = name.style;
  name.style.minWidth = '0px';
  name.style.width = 'min-content';
  const longestWord = name.getBoundingClientRect().width;
  name.style.width = width;
  const floor = Math.min(
    oneLineWidth(name),
    Math.max(longestWord, 4 * parseFloat(getComputedStyle(name).fontSize)),
  );
  name.style.minWidth = minWidth;
  return Math.ceil(floor);
}

/** Room the strip keeps around its open tab's name: the tab's chrome and the "N ▾" list. */
function nameChrome(nav: HTMLElement) {
  const scale = interfaceScale();
  const folded = nav.querySelectorAll('a').length > 1 || nav.querySelector('[data-tab-list]');
  return OPEN_TAB_CHROME * scale + 1 + (folded ? LIST_TRIGGER * scale : 0);
}

/**
 * The width a strip needs to show its open tab's whole name on one line with every
 * closed tab folded into the list, so the page can give it room before the name wraps.
 */
export function navTabsMinWidth(nav: HTMLElement) {
  const name = nav.querySelector<HTMLElement>('[data-tab-name]');
  if (!name) return 0;
  return nameChrome(nav) + oneLineWidth(name);
}

/**
 * The width below which the open name would wrap past its floor. A name that wraps
 * has the "N ▾" list under it, so only the tab's own chrome counts.
 */
export function navTabsFloorWidth(nav: HTMLElement) {
  const name = nav.querySelector<HTMLElement>('[data-tab-name]');
  if (!name) return 0;
  return OPEN_TAB_CHROME * interfaceScale() + 1 + nameFloor(name);
}
