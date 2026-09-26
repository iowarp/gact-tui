/**
 * Turbo colormap (Mikhail, 2019): a perceptually smoother rainbow that keeps
 * the blue-to-red reading FEA users expect from contour plots. Evaluated with
 * the published 5th-order polynomial fit, so there is no lookup table to ship.
 */
export function turbo(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const r =
    0.13572138 +
    x *
      (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))));
  const g =
    0.09140261 +
    x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))));
  const b =
    0.1066733 +
    x *
      (12.64194608 +
        x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))));
  return [clamp01(r), clamp01(g), clamp01(b)];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** CSS `linear-gradient` stops for a legend bar drawn with the same map. */
export function turboGradientCss(direction = 'to right', stops = 12): string {
  const parts: string[] = [];
  for (let index = 0; index <= stops; index += 1) {
    const t = index / stops;
    const [r, g, b] = turbo(t);
    parts.push(
      `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)}) ${(t * 100).toFixed(1)}%`,
    );
  }
  return `linear-gradient(${direction}, ${parts.join(', ')})`;
}

/** Evenly spaced legend ticks between `min` and `max`, inclusive. */
export function legendTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [min];
  return Array.from({ length: count }, (_, index) => min + ((max - min) * index) / (count - 1));
}

/** Compact number formatting for field values (stress in MPa, strains, mm). */
export function formatFieldValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-2 || magnitude >= 1e5)) return value.toExponential(2);
  if (magnitude >= 100) return value.toFixed(0);
  if (magnitude >= 10) return value.toFixed(1);
  return value.toFixed(magnitude >= 1 ? 2 : 3);
}
