/**
 * The right detail column's width model (prototype: drag-resizable 320-720px,
 * default 480). Pure so the clamp is testable apart from the pointer wiring.
 */

export const DETAIL_WIDTH_MIN = 320;
export const DETAIL_WIDTH_MAX = 720;
export const DETAIL_WIDTH_DEFAULT = 480;

/**
 * Clamps a requested detail-column width into the prototype's [320, 720]
 * band. A non-finite request (bad pointer math) resolves to the default
 * rather than propagating NaN into a CSS width.
 */
export function clampDetailWidth(next: number): number {
  if (!Number.isFinite(next)) return DETAIL_WIDTH_DEFAULT;
  return Math.max(DETAIL_WIDTH_MIN, Math.min(DETAIL_WIDTH_MAX, next));
}
