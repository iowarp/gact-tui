/**
 * Isolines of a gridded field by marching squares, as line segments in grid
 * index space (column, row). Cells touching a missing value are skipped.
 * Used by the section view; small enough not to need a contouring library.
 */
export type Segment = [[number, number], [number, number]];

function cross(a: number, b: number, level: number): number {
  return a === b ? 0.5 : (level - a) / (b - a);
}

export function contourSegments(
  values: readonly (readonly (number | null)[])[],
  level: number,
): Segment[] {
  const segments: Segment[] = [];
  for (let row = 0; row + 1 < values.length; row += 1) {
    const top = values[row]!;
    const bottom = values[row + 1]!;
    for (let col = 0; col + 1 < top.length; col += 1) {
      const a = top[col];
      const b = top[col + 1];
      const c = bottom[col + 1];
      const d = bottom[col];
      if (a == null || b == null || c == null || d == null) continue;
      const code =
        (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
      if (code === 0 || code === 15) continue;
      const n: [number, number] = [col + cross(a, b, level), row];
      const e: [number, number] = [col + 1, row + cross(b, c, level)];
      const s: [number, number] = [col + cross(d, c, level), row + 1];
      const w: [number, number] = [col, row + cross(a, d, level)];
      const table: Record<number, Segment[]> = {
        1: [[w, s]],
        2: [[s, e]],
        3: [[w, e]],
        4: [[n, e]],
        5: [
          [w, n],
          [s, e],
        ],
        6: [[n, s]],
        7: [[w, n]],
        8: [[w, n]],
        9: [[n, s]],
        10: [
          [w, s],
          [n, e],
        ],
        11: [[n, e]],
        12: [[w, e]],
        13: [[s, e]],
        14: [[w, s]],
      };
      segments.push(...(table[code] ?? []));
    }
  }
  return segments;
}

/** Contour levels every `interval` across [min, max] (at most `maxLevels`). */
export function contourLevels(
  min: number,
  max: number,
  interval: number | undefined,
  maxLevels = 24,
): number[] {
  if (!(max > min)) return [];
  const step = interval && interval > 0 ? interval : niceStep((max - min) / 8);
  const levels: number[] = [];
  for (
    let level = Math.ceil(min / step) * step;
    level <= max && levels.length < maxLevels;
    level += step
  )
    levels.push(Number(level.toPrecision(10)));
  return levels;
}

/** About `count` round axis ticks across [min, max], with their label text. */
export function axisTicks(min: number, max: number, count = 4): { value: number; label: string }[] {
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  if (!(high > low)) return [{ value: low, label: String(low) }];
  const step = niceStep((high - low) / count);
  const digits = Math.max(0, -Math.floor(Math.log10(step)));
  return contourLevels(low, high, step, count * 3).map((value) => ({
    value,
    label: value.toFixed(digits),
  }));
}

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / power;
  return (fraction < 1.5 ? 1 : fraction < 3.5 ? 2 : fraction < 7.5 ? 5 : 10) * power;
}
