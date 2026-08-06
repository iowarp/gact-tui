/**
 * Single source of truth for the log rail's pixel geometry (owner report,
 * 2026-08-06: fork/merge curves drifting off the row grid and node badges).
 *
 * Before this module the row grid's rail column, the fork/merge elbow, and
 * the node badge each re-typed the SAME `13 + 26 * column` formula as its
 * own independent `calc()` in `observability.css` — three hand-copied
 * literals that happened to agree, not one computation three consumers
 * shared. That is fine right up until it silently isn't (a radius tweak in
 * one rule, a rounding difference in another); the fix is to author the
 * numbers exactly once and have every consumer — CSS included — read them
 * back, never retype them.
 *
 * `railGeometryVars()` threads these numbers onto the `.obs-log` list as
 * inline custom properties; every `.obs-log__rail` / `.obs-log__elbow` /
 * `.obs-log__node` rule in observability.css reads them via `var()`. A unit
 * test (`rail-geometry.test.ts`) pins `columnX` against the values the CSS
 * `calc()` expressions compute for the same column, so the two can never
 * drift apart without a red test.
 *
 * Matches the prototype's own rail grid (~8326614: L0 x=12, L1 x=38, L2
 * x=64, L3 x=90): 26px between rail centers, first center at x=13.
 */

/** X of the first (main) rail's center, in px. */
export const RAIL_X = 13;

/** Horizontal spacing between adjacent rail centers, in px. */
export const RAIL_INDENT = 26;

/** A log row's height — the CSS grid row's `min-height`. Every row is
 *  exactly this tall unless its own text wraps (`overflow-wrap: anywhere`
 *  on `.obs-log__action`, a rare long-action-name case); the elbow's own
 *  row-relative CSS percentages stay correct either way, since they read
 *  the row's OWN rendered height at draw time, not this constant. */
export const ROW_HEIGHT = 26;

/** Corner radius for the fork/merge elbow's curve, in px. */
export const ELBOW_RADIUS = 9;

/** The rail x-coordinate (center of the 2px stroke) a column occupies. */
export function columnX(column: number): number {
  return RAIL_X + column * RAIL_INDENT;
}

/** CSS custom properties carrying this module's numbers onto `.obs-log` —
 *  the ONE place these px values are authored. Spread onto the list's own
 *  `style`; every rail/elbow/node rule in observability.css reads them back
 *  through `var(--obs-rail-x, ...)` etc., never a second hand-typed literal. */
export function railGeometryVars(): Record<string, string> {
  return {
    '--obs-rail-x': `${RAIL_X}px`,
    '--obs-indent': `${RAIL_INDENT}px`,
    '--obs-row-height': `${ROW_HEIGHT}px`,
    '--obs-elbow-radius': `${ELBOW_RADIUS}px`,
  };
}
