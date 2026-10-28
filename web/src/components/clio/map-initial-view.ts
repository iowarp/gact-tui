import type { ViewState } from 'react-map-gl/maplibre';
import type { FeatureCollection, Polygon } from 'geojson';
import offlineLand from '@/assets/offline-basemap/land-110m.json';
import { readThemeColor } from '@/theme/runtime';
import type { ScientificMapPoint } from './scientific-map-view';

export const MAP_BASE_LAYER_ID = 'clio-map-background';

const offlineLandData: FeatureCollection<Polygon> = {
  type: 'FeatureCollection',
  features: offlineLand.features.map((feature) => ({
    type: 'Feature',
    properties: feature.properties,
    geometry: { type: 'Polygon', coordinates: feature.geometry.coordinates },
  })),
};

export const rasterStyle = {
  version: 8 as const,
  sources: {
    openStreetMap: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: MAP_BASE_LAYER_ID, type: 'raster' as const, source: 'openStreetMap' }],
};

export const OFFLINE_LAND_LAYER_ID = 'clio-offline-land';
export const OFFLINE_COASTLINE_LAYER_ID = 'clio-offline-coastline';

/** The contained basemap's water, land and coastline in the active theme. */
export const offlineBasemapColors = () => ({
  water: readThemeColor('muted'),
  land: readThemeColor('card'),
  coastline: readThemeColor('border'),
});

/** Contained geographic context stays distinct from the scientific data layers. */
export const offlineStyle = () => {
  const colors = offlineBasemapColors();
  return {
    version: 8 as const,
    sources: {
      'offline-land': {
        type: 'geojson' as const,
        data: offlineLandData,
        attribution: 'Natural Earth coarse land outline',
      },
    },
    layers: [
      {
        id: MAP_BASE_LAYER_ID,
        type: 'background' as const,
        paint: { 'background-color': colors.water },
      },
      {
        id: OFFLINE_LAND_LAYER_ID,
        type: 'fill' as const,
        source: 'offline-land',
        paint: { 'fill-color': colors.land },
      },
      {
        id: OFFLINE_COASTLINE_LAYER_ID,
        type: 'line' as const,
        source: 'offline-land',
        paint: { 'line-color': colors.coastline, 'line-width': 0.75 },
      },
    ],
  };
};

export function initialView(
  points: readonly ScientificMapPoint[],
  geometryBounds?: [[number, number], [number, number]],
): Partial<ViewState> & {
  bounds?: [[number, number], [number, number]];
  fitBoundsOptions?: { padding: number; maxZoom: number };
} {
  if (points.length === 1 && !geometryBounds) {
    return {
      longitude: points[0]!.longitude,
      latitude: points[0]!.latitude,
      zoom: 8,
    };
  }
  const longitudes = points.map((point) => point.longitude);
  const latitudes = points.map((point) => point.latitude);
  let west = geometryBounds?.[0][0] ?? Math.min(...longitudes);
  let east = geometryBounds?.[1][0] ?? Math.max(...longitudes);
  let south = geometryBounds?.[0][1] ?? Math.min(...latitudes);
  let north = geometryBounds?.[1][1] ?? Math.max(...latitudes);
  if (west === east) [west, east] = [west - 0.01, east + 0.01];
  if (south === north) [south, north] = [south - 0.01, north + 0.01];
  return {
    bounds: [
      [west, south],
      [east, north],
    ],
    fitBoundsOptions: { padding: 48, maxZoom: 12 },
  };
}
