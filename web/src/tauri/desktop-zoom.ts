/**
 * Desktop zoom: the whole window (text, controls, spacing) scales together
 * through the WebView's own zoom, like a browser's Ctrl +/-.
 *
 * Until the user picks a zoom, the level follows the screen: on a large
 * display running at low Windows scaling (a 4K monitor at 100%), the default
 * 100% makes text tiny, so the automatic level grows with the screen's width
 * in CSS pixels. Once the user zooms, their choice is remembered and wins;
 * "Reset zoom" returns to the automatic level.
 */

/** The zoom levels Ctrl +/- steps through (the same ladder as Chromium). */
export const ZOOM_STEPS = [0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;

const STORAGE_KEY = 'clio.desktop.zoom';

/**
 * The zoom for a screen `screenWidth` CSS pixels wide when the user has not
 * chosen one. Windows scaling already shrinks the CSS width (a 4K screen at
 * 150% is 2560 wide), so only screens that are still very wide in CSS pixels
 * are scaled up.
 */
export function automaticZoom(screenWidth: number): number {
  if (screenWidth >= 3400) return 1.5;
  if (screenWidth >= 2800) return 1.25;
  return 1;
}

/** The next step up (`direction` 1) or down (-1) from `current`. */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction === 1) {
    return ZOOM_STEPS.find((step) => step > current + 0.001) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  const lower = ZOOM_STEPS.filter((step) => step < current - 0.001);
  return lower[lower.length - 1] ?? ZOOM_STEPS[0];
}

/** The user's saved zoom, or null when they never chose one (automatic). */
export function savedZoom(): number | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) &&
      value >= ZOOM_STEPS[0] &&
      value <= ZOOM_STEPS[ZOOM_STEPS.length - 1]
      ? value
      : null;
  } catch {
    // Storage can be unavailable (private mode, blocked site data): zoom
    // still works for this run, it just isn't remembered.
    return null;
  }
}

/** Remember `level` as the user's choice, or forget it (`null`) to go automatic. */
export function saveZoom(level: number | null): void {
  try {
    if (level === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, String(level));
  } catch {
    // See savedZoom: not remembering is the only consequence.
  }
}

/**
 * The width, in CSS pixels at 100% zoom, of the monitor this window is on:
 * its physical width over the operating system's scale factor. Read from the
 * monitor rather than `window.screen`, which the WebView's own zoom can skew.
 */
export async function screenWidth(): Promise<number> {
  const { currentMonitor } = await import('@tauri-apps/api/window');
  const monitor = await currentMonitor();
  if (!monitor) return window.screen.width;
  return monitor.size.width / monitor.scaleFactor;
}

/** The zoom this window should use now: the saved choice, else automatic. */
export async function effectiveZoom(): Promise<number> {
  return savedZoom() ?? automaticZoom(await screenWidth());
}

/** Apply `level` to this window's WebView. */
export async function applyZoom(level: number): Promise<void> {
  const { getCurrentWebview } = await import('@tauri-apps/api/webview');
  await getCurrentWebview().setZoom(level);
}
