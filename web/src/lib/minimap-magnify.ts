/**
 * Dock-style magnification for the transcript rail.
 *
 * At rest the landmarks are short and tightly packed. As the pointer nears
 * the rail, landmarks close to it grow longer and move apart (a gaussian
 * falloff by distance), so neighbouring messages become easy to tell apart and
 * to hit. The row under the pointer stays where it is: extra space is added on
 * both sides of it, never shifting what the person is aiming at.
 */

export interface MagnifiedRow {
  /** The row's y after magnification (px, same origin as the input starts). */
  y: number;
  /** 0 (far from the pointer) .. 1 (under it): how much the landmark grows. */
  lift: number;
}

export interface MagnifyOptions {
  /** Distance (px) at which a landmark has grown to ~37% of its full lift. */
  radius?: number;
  /** Extra space (px) a fully lifted row adds to its height. */
  spread?: number;
}

export function magnifyRows(
  starts: readonly number[],
  rowHeight: number,
  pointerY: number | null,
  { radius = 26, spread = 12 }: MagnifyOptions = {},
): MagnifiedRow[] {
  if (pointerY === null) return starts.map((y) => ({ y, lift: 0 }));
  const lifts = starts.map((start) => {
    const distance = start + rowHeight / 2 - pointerY;
    return Math.exp(-((distance / radius) ** 2));
  });
  // The pointer's anchor: all extra space above it, so rows above move up and
  // rows below move down by exactly their share of the added space.
  let anchor = 0;
  starts.forEach((start, index) => {
    const center = start + rowHeight / 2;
    const extra = spread * (lifts[index] ?? 0);
    if (center + rowHeight / 2 <= pointerY) anchor += extra;
    else if (center - rowHeight / 2 < pointerY) {
      anchor += extra * ((pointerY - (center - rowHeight / 2)) / rowHeight);
    }
  });
  let cumulative = 0;
  return starts.map((start, index) => {
    const lift = lifts[index] ?? 0;
    const extra = spread * lift;
    // Center the row inside its own grown slot.
    const y = start + cumulative + extra / 2 - anchor;
    cumulative += extra;
    return { y, lift };
  });
}
