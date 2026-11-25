/** The app shell's layout geometry and the widths and open state it keeps for the person. */

export const WORKBENCH_SHARE_KEY = 'clio.workbench-share.v1';
/** The open or closed canvas, kept for this browser tab so a reload shows what was on screen. */
const WORKBENCH_OPEN_KEY = 'clio.workbench-open.v1';
const DEFAULT_WORKBENCH_SHARE = 0.4;
const MAX_WORKBENCH_SHARE = 0.7;
const MIN_WORKBENCH_WIDTH = 320;
export const MIN_CONVERSATION_WIDTH = 400;
/** The left bar's open width; folded, it is the 56 px icon column. */
export const OPEN_NAVIGATION_WIDTH = 292;
/** How long after reopening the window's re-layout may still move the bar. */
export const RESTORE_WIDTH_MS = 400;

/** The workbench width as a share of the window: 40% to start, then what the user dragged. */
export function storedWorkbenchShare(): number {
  if (typeof window === 'undefined') return DEFAULT_WORKBENCH_SHARE;
  const value = Number(window.localStorage.getItem(WORKBENCH_SHARE_KEY));
  return Number.isFinite(value) && value >= 0.15 && value <= MAX_WORKBENCH_SHARE
    ? value
    : DEFAULT_WORKBENCH_SHARE;
}

export function workbenchWidth(share: number, windowWidth: number): number {
  return Math.max(MIN_WORKBENCH_WIDTH, Math.min(share, MAX_WORKBENCH_SHARE) * windowWidth);
}

export function storedWorkbenchOpen(): boolean | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const value = window.sessionStorage.getItem(WORKBENCH_OPEN_KEY);
    return value === 'open' ? true : value === 'closed' ? false : undefined;
  } catch {
    return undefined;
  }
}

export function storeWorkbenchOpen(open: boolean): void {
  try {
    window.sessionStorage.setItem(WORKBENCH_OPEN_KEY, open ? 'open' : 'closed');
  } catch {
    // Storage may be off; the choice then lasts while the shell is mounted.
  }
}

/** Up to this the left bar folds whenever the workbench is open (spec "Laptop, 1280px"). */
const LAPTOP_WIDTH = 1280;

/**
 * The left bar folds first when the open bar would push the conversation under
 * 400 px, and always at laptop widths and below.
 */
export function conversationNeedsFoldedNavigation(share: number, windowWidth: number): boolean {
  return (
    windowWidth <= LAPTOP_WIDTH ||
    OPEN_NAVIGATION_WIDTH + workbenchWidth(share, windowWidth) + MIN_CONVERSATION_WIDTH >
      windowWidth
  );
}

export function currentWindowWidth(): number {
  return typeof window === 'undefined' ? 1280 : window.innerWidth;
}
