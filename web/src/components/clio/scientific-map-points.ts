import { mapPointColor } from './map-category-palette';

/** One located observation on a scientific map. */
export interface ScientificMapPoint {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  detail?: string;
  category?: string;
  /**
   * The referenced dataset's `selectionField` column value for this point,
   * when `clio.map.v1` names one — the value a bound selection reads and
   * writes, independent of `id`/`label`/`category`. Unset for inline points
   * and for a dataUri map with no `selectionField`.
   */
  selectionValue?: string | number;
  value?: number;
  /** Index of this observation in a queried table, used to form ordered tracks. */
  rowIndex?: number;
  /** Renderer-derived track identity. A click can select its visible observations together. */
  track?: string;
}

interface PointFeatureProperties {
  id: string;
  highlighted: boolean;
  color: string;
}

export function pointsToGeoJson(
  points: readonly ScientificMapPoint[],
  highlightedIds: ReadonlySet<string>,
  categoryColors: ReadonlyMap<string, string>,
  valueExtent?: [number, number],
) {
  return {
    type: 'FeatureCollection' as const,
    features: points.map((point) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [point.longitude, point.latitude] },
      properties: {
        id: point.id,
        highlighted: highlightedIds.has(point.id),
        color: mapPointColor(point, categoryColors, valueExtent),
      } satisfies PointFeatureProperties,
    })),
  };
}

export type PointsGeoJson = ReturnType<typeof pointsToGeoJson>;
