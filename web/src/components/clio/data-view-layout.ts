import type { CSSProperties } from 'react';

/**
 * Flex sizing for a chart or map inside an A2UI `Row` or `Column`.
 *
 * A declared `weight` is the producer's explicit share, applied the way the
 * kernel layout applies it. Without one, the view takes an equal share of a
 * row (basis 0, grow 1) instead of sizing to its content: a Vega chart's
 * intrinsic width would otherwise take most of the row and squeeze a map
 * beside it to a sliver. In a column the same rule keeps the view's content
 * height, because `min-height` stays `auto`.
 */
export function dataViewFlexStyle(weight: number | undefined): CSSProperties {
  if (typeof weight === 'number') return { flex: `${weight}`, minWidth: 0, minHeight: 0 };
  return { flex: '1 1 0%', minWidth: 0 };
}
