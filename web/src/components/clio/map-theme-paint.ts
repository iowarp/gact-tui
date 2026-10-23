import type { ExpressionSpecification, MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import { readThemeColor } from '@/theme/runtime';
import {
  MAP_BASE_LAYER_ID,
  OFFLINE_COASTLINE_LAYER_ID,
  OFFLINE_LAND_LAYER_ID,
  offlineBasemapColors,
} from './map-initial-view';

export const POINTS_LAYER_ID = 'clio-map-points-circles';
export const GEOMETRY_LAYER_IDS = [
  'clio-map-geometry-fill',
  'clio-map-geometry-line',
  'clio-map-geometry-points',
] as const;

/** Paint colors: maplibre evaluates these itself and cannot read CSS custom properties. */
export const highlightedPointColor = () => readThemeColor('action');
export const markerOutlineColor = () => readThemeColor('card');

/** Layers are created in the current theme's colors; repaint them when the theme changes. */
export function useMapThemeRepaint(map: MapLibreMap | undefined, theme: string): void {
  const paintedThemeRef = useRef(theme);
  useEffect(() => {
    if (!map || paintedThemeRef.current === theme) return;
    paintedThemeRef.current = theme;
    const paint = (
      layerId: string,
      property: Parameters<MapLibreMap['setPaintProperty']>[1],
      value: Parameters<MapLibreMap['setPaintProperty']>[2],
    ) => {
      if (map.getLayer(layerId)) map.setPaintProperty(layerId, property, value);
    };
    const color: ExpressionSpecification = [
      'case',
      ['get', 'highlighted'],
      highlightedPointColor(),
      ['get', 'color'],
    ];
    const outline = markerOutlineColor();
    paint(POINTS_LAYER_ID, 'circle-color', color);
    paint(POINTS_LAYER_ID, 'circle-stroke-color', outline);
    paint(GEOMETRY_LAYER_IDS[0], 'fill-color', color);
    paint(GEOMETRY_LAYER_IDS[0], 'fill-outline-color', outline);
    paint(GEOMETRY_LAYER_IDS[1], 'line-color', color);
    paint(GEOMETRY_LAYER_IDS[2], 'circle-color', color);
    paint(GEOMETRY_LAYER_IDS[2], 'circle-stroke-color', outline);
    if (map.getLayer(MAP_BASE_LAYER_ID)?.type === 'background') {
      const basemap = offlineBasemapColors();
      paint(MAP_BASE_LAYER_ID, 'background-color', basemap.water);
      paint(OFFLINE_LAND_LAYER_ID, 'fill-color', basemap.land);
      paint(OFFLINE_COASTLINE_LAYER_ID, 'line-color', basemap.coastline);
    }
  }, [map, theme]);
}
