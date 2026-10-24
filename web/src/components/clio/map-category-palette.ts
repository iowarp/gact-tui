import { readThemeColor } from '@/theme/runtime';
import { categoryColor, categoryPalette } from './category-colors';

/** Map colours come from the active theme; maps redraw when the theme changes. */
export const uncategorizedColor = () => readThemeColor('muted-foreground');
export const continuousScaleColors = () =>
  [readThemeColor('scale-low'), readThemeColor('scale-mid'), readThemeColor('scale-high')] as const;

export function mapValueExtent(
  points: readonly { value?: number }[],
): [number, number] | undefined {
  const values = points
    .map((point) => point.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length ? [Math.min(...values), Math.max(...values)] : undefined;
}

function mixHex(left: string, right: string, fraction: number): string {
  if (!left.startsWith('#') || !right.startsWith('#')) return fraction < 0.5 ? left : right;
  const channel = (offset: number) => {
    const from = Number.parseInt(left.slice(offset, offset + 2), 16);
    const to = Number.parseInt(right.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * fraction)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function mapValueColor(value: number, extent: [number, number]): string {
  const normalized =
    extent[0] === extent[1]
      ? 0.5
      : Math.max(0, Math.min(1, (value - extent[0]) / (extent[1] - extent[0])));
  const [low, mid, high] = continuousScaleColors();
  return normalized < 0.5
    ? mixHex(low, mid, normalized * 2)
    : mixHex(mid, high, (normalized - 0.5) * 2);
}

export function mapCategoryColors(points: readonly { category?: string }[]): Map<string, string> {
  const names = [
    ...new Set(
      points.map((point) => point.category).filter((name): name is string => Boolean(name)),
    ),
  ].sort((left, right) => left.localeCompare(right));
  return new Map(names.map((name) => [name, categoryColor(name)]));
}

export function mapPointColor(
  point: { category?: string; value?: number },
  colors: ReadonlyMap<string, string>,
  extent?: [number, number],
): string {
  if (extent)
    return typeof point.value === 'number' && Number.isFinite(point.value)
      ? mapValueColor(point.value, extent)
      : uncategorizedColor();
  if (colors.size === 0) return categoryPalette()[0]!;
  return point.category
    ? (colors.get(point.category) ?? uncategorizedColor())
    : uncategorizedColor();
}
