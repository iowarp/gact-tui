import type { FeatureProperties } from './layered-map-model';

/** One colour a points or tracks layer paints by its `categoryField`. */
export interface CategoryLegendEntry {
  /** The category; `null` for features without one, painted in the layer's plain colour. */
  category: string | null;
  color: string;
  /** Points shown in this category (one per track for a tracks layer). */
  count: number;
}

/** A layer's category legend, as the layer last painted it. */
export interface CategoryLegend {
  layerId: string;
  label: string;
  field: string;
  entries: CategoryLegendEntry[];
}

/** Categories shown before the rest fold into a "+N more" control. */
export const CATEGORY_LEGEND_SHOWN = 8;

/**
 * Tally the colours a layer painted by category, from the features it just coloured.
 * The colour is the one on the feature, so the legend shows what the map shows even
 * when the shared category registry later gives a slot to another category. A track
 * counts once (its head point); features coloured by value are not categories.
 */
export function tallyCategories(
  features: readonly { geometry: { type: string }; properties: FeatureProperties }[],
  colorOf: (feature: { properties: FeatureProperties }) => string | undefined,
): CategoryLegendEntry[] {
  const tally = new Map<string | null, CategoryLegendEntry>();
  for (const feature of features) {
    if (feature.geometry.type !== 'Point') continue;
    const color = colorOf(feature);
    if (color === undefined) continue;
    const category = feature.properties.category ?? null;
    const entry = tally.get(category);
    if (entry) entry.count += 1;
    else tally.set(category, { category, color, count: 1 });
  }
  return [...tally.values()].sort(
    (left, right) =>
      Number(left.category === null) - Number(right.category === null) ||
      right.count - left.count ||
      String(left.category).localeCompare(String(right.category)),
  );
}
