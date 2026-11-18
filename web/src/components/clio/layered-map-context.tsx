import type { GeoJSONSource, MapLibreMap } from 'maplibre-gl';
import { useEffect, useState } from 'react';
import { readThemeColor } from '@/theme/runtime';
import {
  degreesLabel,
  graticuleLines,
  MAX_POINT_LABELS,
  withoutOverlaps,
} from './layered-map-graticule';

/**
 * Geographic context for the layered map: latitude and longitude lines with their
 * values at the edges, and the names of a few labelled points.
 *
 * A map zoomed onto open ocean otherwise shows its marks on a blank field, with no
 * coast, no coordinates and no scale, and neither the person nor the agent can tell
 * where it is or how far apart things are (the cruise plan in Q13: six unnamed dots).
 * The offline base style has no font glyphs, so every text here is HTML placed with
 * the map's projection, not a map symbol layer.
 */

const GRATICULE_SOURCE = 'clio-layered-graticule';
export interface PointLabel {
  key: string;
  longitude: number;
  latitude: number;
  text: string;
}

interface EdgeLabel {
  key: string;
  text: string;
  x: number;
  y: number;
}

/** Graticule lines under the data, coordinate values at the edges, and point names. */
export function LayeredMapContext({
  map,
  labels,
}: {
  map: MapLibreMap;
  labels: readonly PointLabel[];
}) {
  const [edges, setEdges] = useState<EdgeLabel[]>([]);
  const [placed, setPlaced] = useState<{ key: string; text: string; x: number; y: number }[]>([]);
  useEffect(() => {
    // The lines last written: a write repaints the map, so it happens only when they
    // change, never on the map's own repaint events (that would never let it settle,
    // and a capture of the view would wait for it forever).
    let drawn = '';
    const update = () => {
      const bounds = map.getBounds();
      const { collection, lons, lats } = graticuleLines(
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      );
      const key = `${lons.join(',')}|${lats.join(',')}`;
      const source = map.getSource(GRATICULE_SOURCE) as GeoJSONSource | undefined;
      if (source) {
        if (key !== drawn) source.setData(collection);
        drawn = key;
      } else if (map.getStyle()?.layers) {
        drawn = key;
        map.addSource(GRATICULE_SOURCE, { type: 'geojson', data: collection });
        // First in the stack, so every data layer draws above the lines.
        const below = map
          .getStyle()
          .layers?.find((layer) => layer.id.startsWith('clio-layer-'))?.id;
        map.addLayer(
          {
            id: GRATICULE_SOURCE,
            type: 'line',
            source: GRATICULE_SOURCE,
            paint: {
              'line-color': readThemeColor('muted-foreground'),
              'line-opacity': 0.35,
              'line-width': 0.75,
              'line-dasharray': [2, 3],
            },
          },
          below,
        );
      }
      const canvas = map.getCanvas();
      const height = canvas.clientHeight;
      const width = canvas.clientWidth;
      setEdges([
        ...lons
          .map((lon) => ({ lon, x: map.project([lon, bounds.getSouth()]).x }))
          // Along the top: the bottom edge holds the scale and the data attribution,
          // the top right the zoom buttons.
          .filter(({ x }) => x > 56 && x < width - 56)
          .map(({ lon, x }) => ({
            key: `lon${lon}`,
            text: degreesLabel(lon, 'lon'),
            x,
            y: 4,
          })),
        ...lats
          .map((lat) => ({ lat, y: map.project([bounds.getWest(), lat]).y }))
          .filter(({ y }) => y > 20 && y < height - 28)
          .map(({ lat, y }) => ({ key: `lat${lat}`, text: degreesLabel(lat, 'lat'), x: 4, y })),
      ]);
      setPlaced(
        withoutOverlaps(
          labels.slice(0, MAX_POINT_LABELS).map((label) => {
            const point = map.project([label.longitude, label.latitude]);
            return { key: label.key, text: label.text, x: point.x, y: point.y };
          }),
        ),
      );
    };
    // The style may still be loading at first, or be replaced (a theme change): the
    // lines are added once it is ready, and only when they are missing.
    const ensure = () => {
      if (!map.getSource(GRATICULE_SOURCE)) update();
    };
    update();
    map.on('move', update);
    map.on('resize', update);
    map.on('styledata', ensure);
    map.on('idle', ensure);
    return () => {
      map.off('move', update);
      map.off('resize', update);
      map.off('styledata', ensure);
      map.off('idle', ensure);
    };
  }, [labels, map]);
  useEffect(
    () => () => {
      if (map.getLayer(GRATICULE_SOURCE)) map.removeLayer(GRATICULE_SOURCE);
      if (map.getSource(GRATICULE_SOURCE)) map.removeSource(GRATICULE_SOURCE);
    },
    [map],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {edges.map((edge) => (
        <span
          key={edge.key}
          className="absolute text-[10px] leading-none text-muted-foreground tabular-nums"
          style={
            edge.key.startsWith('lon')
              ? { left: edge.x, top: edge.y, transform: 'translateX(-50%)' }
              : { left: edge.x, top: edge.y, transform: 'translateY(-50%)' }
          }
        >
          {edge.text}
        </span>
      ))}
      {placed.map((label) => (
        <span
          key={label.key}
          className="absolute rounded bg-background/80 px-1 text-[11px] leading-tight text-foreground"
          style={{ left: label.x + 7, top: label.y, transform: 'translateY(-50%)' }}
        >
          {label.text}
        </span>
      ))}
    </div>
  );
}
