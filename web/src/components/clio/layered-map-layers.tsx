import type { ArtifactGridInfo } from '@clio/core/v3';
import type { GeoJSONSource, MapLibreMap, RasterTileSource } from 'maplibre-gl';
import { useEffect, useMemo } from 'react';
import { readThemeColor } from '@/theme/runtime';
import { categoryColor } from './category-colors';
import { tileTemplate } from './clio-tile-protocol';
import { OFFLINE_COASTLINE_LAYER_ID } from './map-initial-view';
import { applyEdits, isoTime, layerFeatures, type MapLayer } from './layered-map-model';
import { mapValueColor } from './map-category-palette';
import { layerSourceId, layerStyleIds, removeLayer } from './layered-map-style';
import { colourShapes, SHAPE_COLOUR } from './layered-map-shapes';
import { useTableQueryRows, type QueryRow, type TableDataQuery } from './table-query-rows';

/**
 * Each map layer owns its MapLibre source and style layers: a grid layer a
 * raster tile source whose URL follows the shared time, a table layer a
 * GeoJSON source of the features visible at that time.
 */
export function GridLayerSource({
  map,
  layer,
  info,
  now,
  visible,
}: {
  map: MapLibreMap;
  layer: MapLayer;
  info: ArtifactGridInfo | undefined;
  now: number | undefined;
  visible: boolean;
}) {
  const artifactId = layer.gridUri!.replace('artifact://', '');
  const timeDim = layer.timeDimension ?? 'time';
  const hasTime = Boolean(info?.leading.some((dim) => dim.dim === timeDim));
  const range = layer.valueRange ?? info?.range;
  const tiles = useMemo(
    () =>
      tileTemplate(artifactId, {
        variable: layer.variable,
        select: {
          ...(layer.fixed ?? {}),
          ...(hasTime && now !== undefined ? { [timeDim]: isoTime(now) } : {}),
        },
        colormap: layer.colormap ?? 'viridis',
        vmin: range?.[0],
        vmax: range?.[1],
      }),
    [artifactId, hasTime, layer.colormap, layer.fixed, layer.variable, now, range, timeDim],
  );
  useEffect(() => {
    if (!info) return;
    const sourceId = layerSourceId(layer);
    const source = map.getSource(sourceId) as RasterTileSource | undefined;
    if (source) {
      source.setTiles([tiles]);
    } else {
      const [west, south, east, north] = info.bounds;
      map.addSource(sourceId, {
        type: 'raster',
        tiles: [tiles],
        tileSize: 256,
        bounds: [
          Math.max(-180, west),
          Math.max(-85, south),
          Math.min(180, east),
          Math.min(85, north),
        ],
      });
      // Beneath the coastline, so the land outline stays readable over the field.
      map.addLayer(
        {
          id: layerStyleIds(layer)[0]!,
          type: 'raster',
          source: sourceId,
          paint: { 'raster-opacity': layer.opacity ?? 0.85, 'raster-resampling': 'nearest' },
        },
        map.getLayer(OFFLINE_COASTLINE_LAYER_ID) ? OFFLINE_COASTLINE_LAYER_ID : undefined,
      );
    }
  }, [info, layer, map, tiles]);
  useEffect(() => {
    const id = layerStyleIds(layer)[0]!;
    if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }, [layer, map, visible, info]);
  useEffect(() => () => removeLayer(map, layer), [layer, map]);
  return null;
}

function featureColor(
  properties: { category?: string; value?: number },
  layer: MapLayer,
  extent: [number, number] | undefined,
): string {
  if (layer.valueField && extent && properties.value !== undefined)
    return mapValueColor(properties.value, extent);
  if (layer.categoryField && properties.category) return categoryColor(properties.category);
  return readThemeColor('primary');
}

export function TableLayerSource({
  map,
  layer,
  now,
  edits,
  selectedIds,
  visible,
  query,
  onRows,
}: {
  map: MapLibreMap;
  layer: MapLayer;
  now: number | undefined;
  edits: unknown;
  selectedIds: ReadonlySet<string>;
  visible: boolean;
  query: TableDataQuery | undefined;
  onRows: (layerId: string, rows: readonly QueryRow[], note: string) => void;
}) {
  const columns = useMemo(
    () =>
      [
        layer.latitudeField,
        layer.longitudeField,
        layer.idField,
        layer.labelField,
        layer.timeField,
        layer.trackField,
        layer.categoryField,
        layer.valueField,
      ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index),
    [layer],
  );
  const loaded = useTableQueryRows({
    columns,
    data: undefined,
    dataQuery: query,
    dataUri: layer.dataUri,
  });
  const rows = useMemo(
    () => applyEdits(layer, loaded.rows ?? [], edits),
    [edits, layer, loaded.rows],
  );
  useEffect(() => {
    if (loaded.rows) onRows(layer.id, loaded.rows, loaded.note || loaded.error);
  }, [layer.id, loaded.error, loaded.note, loaded.rows, onRows]);
  const extent = useMemo<[number, number] | undefined>(() => {
    if (layer.valueRange) return layer.valueRange;
    if (!layer.valueField) return undefined;
    const values = rows
      .map((row) => row[layer.valueField!])
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    return values.length ? [Math.min(...values), Math.max(...values)] : undefined;
  }, [layer.valueField, layer.valueRange, rows]);
  const collection = useMemo(() => {
    const features = layerFeatures(layer, rows, now);
    for (const feature of features.features) {
      const props = feature.properties as unknown as Record<string, unknown>;
      props.color = featureColor(feature.properties, layer, extent);
      props.selected = selectedIds.has(feature.properties.id);
    }
    return features;
  }, [extent, layer, now, rows, selectedIds]);
  useEffect(() => {
    const sourceId = layerSourceId(layer);
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (source) {
      source.setData(collection);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data: collection });
    const outline = readThemeColor('background');
    const highlight = readThemeColor('foreground');
    map.addLayer({
      id: layerStyleIds(layer)[0]!,
      type: 'line',
      source: sourceId,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['case', ['get', 'selected'], 4, 2],
        'line-opacity': layer.opacity ?? 0.9,
      },
    });
    map.addLayer({
      id: layerStyleIds(layer)[1]!,
      type: 'circle',
      source: sourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': [
          'case',
          ['get', 'selected'],
          8,
          ['boolean', ['get', 'head'], false],
          6,
          layer.editable ? 7 : 4,
        ],
        'circle-stroke-color': ['case', ['get', 'selected'], highlight, outline],
        'circle-stroke-width': ['case', ['get', 'selected'], 2.5, 1],
        'circle-opacity': layer.opacity ?? 0.95,
      },
    });
  }, [collection, layer, map]);
  useEffect(() => {
    for (const id of layerStyleIds(layer))
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }, [layer, map, visible, collection]);
  useEffect(() => () => removeLayer(map, layer), [layer, map]);
  return null;
}

/** A shapes layer: a registered GeoJSON file read through the authenticated resolver. */
export function ShapesLayerSource({
  map,
  layer,
  visible,
  geojson,
}: {
  map: MapLibreMap;
  layer: MapLayer;
  visible: boolean;
  geojson: unknown;
}) {
  // Each feature carries its colour: its category's when the layer names a
  // categoryField, else the layer's own, so overlapping shapes layers differ.
  const coloured = useMemo(() => colourShapes(geojson, layer), [geojson, layer]);
  useEffect(() => {
    if (!coloured) return;
    const sourceId = layerSourceId(layer);
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (source) {
      source.setData(coloured as never);
      return;
    }
    map.addSource(sourceId, { type: 'geojson', data: coloured as never });
    const [lineId, circleId, fillId] = layerStyleIds(layer);
    const colour = ['get', SHAPE_COLOUR] as never;
    const opacity = layer.opacity ?? 0.9;
    map.addLayer({
      id: fillId!,
      type: 'fill',
      source: sourceId,
      filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false],
      paint: { 'fill-color': colour, 'fill-opacity': Math.min(0.6, opacity * 0.4) },
    });
    map.addLayer({
      id: lineId!,
      type: 'line',
      source: sourceId,
      paint: { 'line-color': colour, 'line-width': 1.5, 'line-opacity': opacity },
    });
    map.addLayer({
      id: circleId!,
      type: 'circle',
      source: sourceId,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-color': colour, 'circle-radius': 4 },
    });
  }, [coloured, layer, map]);
  useEffect(() => {
    for (const id of layerStyleIds(layer))
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
  }, [coloured, layer, map, visible]);
  useEffect(() => () => removeLayer(map, layer), [layer, map]);
  return null;
}
