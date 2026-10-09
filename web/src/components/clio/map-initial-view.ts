import type { ViewState } from 'react-map-gl/maplibre';
import type { ScientificMapPoint } from './scientific-map-view';

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
  layers: [{ id: 'openStreetMap', type: 'raster' as const, source: 'openStreetMap' }],
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
