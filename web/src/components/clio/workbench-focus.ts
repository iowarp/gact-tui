import { keepFocusInFrame } from './file-viewer-modes';
import { refocusActiveCanvasTab } from './workbench-tab-row';

/** Frames to wait for a picked tab's body to mount (a lazy viewer) before settling on its tab. */
const MOUNT_FRAMES = 20;

/** Focus left with the unmounted row: on the page, or on a container around the pocket (the phone sheet). */
const lost = (region: Element) => {
  const active = document.activeElement;
  return !active || active === document.body || active.contains(region);
};

const shown = (element: Element) => element.getClientRects().length > 0;

/**
 * A pick in a list replaces the row that held focus. Focus lands in the opened
 * file's frame, so the tab's keys (⇧V, ⇧L, L) answer at once; another kind of
 * tab, or a body still loading, settles on its tab.
 */
export function focusOpenedFrame(region: Element | null) {
  let frames = 0;
  const step = () => {
    if (!region?.isConnected || !lost(region)) return;
    const frame = [...region.querySelectorAll('[data-slot="file-viewer"]')].find(shown);
    if (frame) keepFocusInFrame(frame);
    else if (++frames < MOUNT_FRAMES) requestAnimationFrame(step);
    else refocusActiveCanvasTab(region);
  };
  requestAnimationFrame(step);
}

/** Back to a list returns focus to the row it was opened from, or to the list's tab. */
export function focusListRow(region: Element | null, name: string | undefined) {
  let frames = 0;
  const step = () => {
    if (!region?.isConnected || !lost(region)) return;
    const row = name
      ? [...region.querySelectorAll<HTMLElement>('[role="treeitem"], [role="row"], [role="option"]')]
          .filter(shown)
          .find((element) => element.getAttribute('aria-label') === name)
      : undefined;
    if (row) row.focus({ preventScroll: false });
    else if (++frames < MOUNT_FRAMES) requestAnimationFrame(step);
    else refocusActiveCanvasTab(region);
  };
  requestAnimationFrame(step);
}
