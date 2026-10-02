/** Stable within one map view; selection orange is reserved for highlights. */
export const CATEGORY_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#db2777',
  '#0891b2',
  '#65a30d',
  '#be123c',
  '#4f46e5',
  '#0f766e',
  '#a21caf',
  '#475569',
  '#a16207',
] as const;

export const UNCATEGORIZED_COLOR = '#64748b';
export const CONTINUOUS_LOW_COLOR = '#0ea5e9';
export const CONTINUOUS_MID_COLOR = '#f59e0b';
export const CONTINUOUS_HIGH_COLOR = '#be123c';

export function mapValueExtent(points: readonly { value?: number }[]): [number, number] | undefined {
  const values = points.map((point) => point.value).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length ? [Math.min(...values), Math.max(...values)] : undefined;
}

function mixHex(left: string, right: string, fraction: number): string {
  const channel = (offset: number) => {
    const from = Number.parseInt(left.slice(offset, offset + 2), 16);
    const to = Number.parseInt(right.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * fraction).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

export function mapValueColor(value: number, extent: [number, number]): string {
  const normalized = extent[0] === extent[1] ? 0.5 : Math.max(0, Math.min(1, (value - extent[0]) / (extent[1] - extent[0])));
  return normalized < 0.5
    ? mixHex(CONTINUOUS_LOW_COLOR, CONTINUOUS_MID_COLOR, normalized * 2)
    : mixHex(CONTINUOUS_MID_COLOR, CONTINUOUS_HIGH_COLOR, (normalized - 0.5) * 2);
}

export function mapCategoryColors(points: readonly { category?: string }[]): Map<string, string> {
  const names = [...new Set(points.map((point) => point.category).filter((name): name is string => Boolean(name)))].sort(
    (left, right) => left.localeCompare(right),
  );
  return new Map(names.map((name, index) => [name, CATEGORY_COLORS[index % CATEGORY_COLORS.length]!]));
}

export function mapPointColor(
  point: { category?: string; value?: number },
  colors: ReadonlyMap<string, string>,
  extent?: [number, number],
): string {
  if (extent) return typeof point.value === 'number' && Number.isFinite(point.value) ? mapValueColor(point.value, extent) : UNCATEGORIZED_COLOR;
  if (colors.size === 0) return CATEGORY_COLORS[0];
  return point.category ? (colors.get(point.category) ?? UNCATEGORIZED_COLOR) : UNCATEGORIZED_COLOR;
}
