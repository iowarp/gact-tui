import { categoryColor } from './category-colors';
import type { MapLayer } from './layered-map-model';

/** The feature property that carries each shape's resolved colour. */
export const SHAPE_COLOUR = '__clio_colour';

/** The GeoJSON with each feature's colour in SHAPE_COLOUR (undefined if not GeoJSON). */
export function colourShapes(geojson: unknown, layer: MapLayer): unknown {
  if (!geojson || typeof geojson !== 'object') return undefined;
  const collection = geojson as { type?: string; features?: unknown[] };
  const features =
    collection.type === 'FeatureCollection' && Array.isArray(collection.features)
      ? collection.features
      : collection.type === 'Feature'
        ? [collection]
        : undefined;
  if (!features) return geojson;
  const own = categoryColor(`layer:${layer.id}`);
  return {
    type: 'FeatureCollection',
    features: features.map((feature) => {
      const item = feature as { properties?: Record<string, unknown> | null };
      const properties = item.properties ?? {};
      const category = layer.categoryField ? properties[layer.categoryField] : undefined;
      const colour =
        typeof category === 'string' ||
        typeof category === 'number' ||
        typeof category === 'boolean'
          ? categoryColor(category)
          : own;
      return { ...item, properties: { ...properties, [SHAPE_COLOUR]: colour } };
    }),
  };
}
