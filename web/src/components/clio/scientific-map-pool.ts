/**
 * Pooled map instances: which view owns a reused MapLibre map, which geometry
 * it still holds, and handing that geometry to the next view that shows the
 * same data instead of parsing it again.
 */
import type { FeatureCollection } from 'geojson';
import type { MapLibreMap } from 'maplibre-gl';
import { GEOMETRY_LAYER_IDS } from './map-theme-paint';

export const GEOMETRY_SOURCE_ID = 'clio-map-geometry';
/** Which mounted view last claimed the points layer on a (possibly pooled) map instance. */
export const pointsLayerOwners = new WeakMap<MapLibreMap, symbol>();
/** Which geometry a (possibly pooled) map instance currently holds. */
export const geometryKeys = new WeakMap<MapLibreMap, string>();
/** Removes geometry a released view left on its pooled map for a successor. */
export const pendingGeometryTeardowns = new WeakMap<MapLibreMap, () => void>();
/** How long a released map keeps its geometry for a view that shows the same data. */
export const GEOMETRY_HANDOVER_MS = 1_000;

/** The features and the layer styling they were drawn with; a handover keeps only an exact match. */
export function geometryKey(geometry: FeatureCollection, denseTrajectories: boolean): string {
  return `${denseTrajectories ? 'dense' : 'sparse'}:${geometry.features.length}:${geometry.features.map((feature) => String(feature.id)).join(',')}`;
}

export function removeGeometryLayers(map: MapLibreMap) {
  geometryKeys.delete(map);
  try {
    for (const id of GEOMETRY_LAYER_IDS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(GEOMETRY_SOURCE_ID)) map.removeSource(GEOMETRY_SOURCE_ID);
  } catch {
    /* Pooled map style was already removed. */
  }
}

/**
 * Claim a pooled map for a view. Geometry a previous view left behind stays
 * only when it is the same data, so the next view draws it on its first frame
 * instead of parsing it again.
 */
export function claimMap(map: MapLibreMap, owner: symbol, keepGeometryKey?: string) {
  pointsLayerOwners.set(map, owner);
  const teardown = pendingGeometryTeardowns.get(map);
  if (!teardown) return;
  pendingGeometryTeardowns.delete(map);
  if (keepGeometryKey === undefined || geometryKeys.get(map) !== keepGeometryKey) teardown();
}

/**
 * Read-only mounted map handle for capture and e2e inspection. An e2e assertion needs to see the map's ACTUAL declared
 * layer/source state, which no DOM query can ever observe — a "500 labeled
 * locations" list item proves the data resolved into React props, never
 * that the map component turned it into a real maplibre layer. Never read
 * by general app code; the region capture uses it to request a fresh frame. See `a2ui-data-everywhere.spec.ts`'s `mapPointsLayerData`
 * helper (and its doc comment, which also covers why a live WebGL-paint
 * assertion is not reliable in that harness).
 */
export interface MapDebugSurface extends HTMLDivElement {
  __clioMap?: MapLibreMap;
  __clioMapFailure?: string;
}
