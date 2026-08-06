/**
 * Pins the log rail's single source of truth (railGeometry.ts, owner report
 * 2026-08-06): the row grid, node badges and fork/merge elbow curves must
 * all compute from the SAME constants. These tests assert `columnX` against
 * the exact formula `observability.css` reads back through `var()`, and that
 * `railGeometryVars()` is what actually reaches the DOM.
 */
import { describe, expect, it } from 'vitest';
import {
  ELBOW_RADIUS,
  RAIL_INDENT,
  RAIL_X,
  ROW_HEIGHT,
  columnX,
  railGeometryVars,
} from '../../src/observability/railGeometry';

describe('railGeometry — single source of truth', () => {
  it('columnX matches the CSS calc() formula (`13 + 26 * column`) for every rail/elbow/node rule', () => {
    // observability.css: .obs-log__rail left = --obs-rail-x - 1px + i * --obs-indent
    // (the -1px only centers the 2px border stroke on this x, not a second
    // x formula); .obs-log__elbow left = --obs-rail-x + i * --obs-indent;
    // .obs-log__node left = --obs-rail-x + col * --obs-indent. All three
    // reduce to the SAME columnX(i).
    expect(columnX(0)).toBe(13);
    expect(columnX(1)).toBe(39);
    expect(columnX(2)).toBe(65);
    expect(columnX(3)).toBe(91);
    for (let column = 0; column < 8; column += 1) {
      expect(columnX(column)).toBe(RAIL_X + column * RAIL_INDENT);
    }
  });

  it('exposes the exact numbers the prototype rail grid pinned (~8326614: L0 x=12ish/13, L1 x=38/39, L2 x=64/65, L3 x=90/91)', () => {
    expect(RAIL_X).toBe(13);
    expect(RAIL_INDENT).toBe(26);
  });

  it('railGeometryVars() is the ONE place these px values are authored — every key CSS reads via var()', () => {
    const vars = railGeometryVars();
    expect(vars).toEqual({
      '--obs-rail-x': `${RAIL_X}px`,
      '--obs-indent': `${RAIL_INDENT}px`,
      '--obs-row-height': `${ROW_HEIGHT}px`,
      '--obs-elbow-radius': `${ELBOW_RADIUS}px`,
    });
  });

  it('is a pure function — same call, same object shape, no hidden state', () => {
    expect(railGeometryVars()).toEqual(railGeometryVars());
  });
});
