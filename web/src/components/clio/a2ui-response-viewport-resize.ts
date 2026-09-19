/**
 * Sizing and persistence for the pending A2UI response tray's inline viewport.
 *
 * Kept apart from `pending-a2ui-response.tsx` so the height math and the
 * sessionStorage read/write are unit-testable without mounting the component,
 * and so the component file stays about rendering, not arithmetic.
 */

/** Never smaller than this — below it, most catalog components (maps, tables) stop being usable. */
export const MIN_VIEWPORT_HEIGHT = 240;

/** Never taller than this fraction of the window — leaves room for the composer and header chrome above it. */
export const MAX_VIEWPORT_HEIGHT_RATIO = 0.85;

/** First-open height for a surface with no remembered size yet. */
export const DEFAULT_VIEWPORT_HEIGHT = 480;

const STORAGE_PREFIX = 'clio.a2ui-viewport-height';

function viewportHeightStorageKey(surfaceKey: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(surfaceKey)}`;
}

/** The tallest the viewport may grow to, given the window's current inner height. */
export function maxViewportHeight(windowInnerHeight: number): number {
  return Math.max(MIN_VIEWPORT_HEIGHT, Math.floor(windowInnerHeight * MAX_VIEWPORT_HEIGHT_RATIO));
}

/** Clamp a candidate height into [MIN_VIEWPORT_HEIGHT, maxViewportHeight(windowInnerHeight)]. */
export function clampViewportHeight(height: number, windowInnerHeight: number): number {
  return Math.min(maxViewportHeight(windowInnerHeight), Math.max(MIN_VIEWPORT_HEIGHT, height));
}

/**
 * The height this surface was last resized to in this browser tab, if any.
 *
 * `sessionStorage` access can throw (Tauri/Chromium `SecurityError` when site
 * data is blocked, a private window, etc.) — a failed read degrades to "no
 * remembered height" rather than crashing the resize affordance.
 */
export function readPersistedViewportHeight(surfaceKey: string): number | undefined {
  try {
    const raw = window.sessionStorage.getItem(viewportHeightStorageKey(surfaceKey));
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : undefined;
  } catch (error) {
    console.warn('a2ui viewport height read skipped reason=session_storage_unavailable', error);
    return undefined;
  }
}

/**
 * Remember a resize for this surface, scoped to this browser tab only (never
 * shared, never read back by the server). Best-effort: a blocked
 * `sessionStorage` (see {@link readPersistedViewportHeight}) just means the
 * next open falls back to the default height, not a thrown error mid-resize.
 */
export function persistViewportHeight(surfaceKey: string, height: number): void {
  try {
    window.sessionStorage.setItem(
      viewportHeightStorageKey(surfaceKey),
      String(Math.round(height)),
    );
  } catch (error) {
    console.warn('a2ui viewport height write skipped reason=session_storage_unavailable', error);
  }
}

/** The height to open a surface's viewport at: its remembered height, clamped, or the default. */
export function initialViewportHeight(surfaceKey: string, windowInnerHeight: number): number {
  const persisted = readPersistedViewportHeight(surfaceKey);
  if (persisted !== undefined) return clampViewportHeight(persisted, windowInnerHeight);
  return clampViewportHeight(DEFAULT_VIEWPORT_HEIGHT, windowInnerHeight);
}
