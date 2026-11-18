import type { FeatureCollection, LineString } from 'geojson';

/** Most point labels drawn: beyond this the names would cover each other and the data. */
export const MAX_POINT_LABELS = 40;
const STEPS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30];

/** A line spacing giving about four to eight lines across ``span`` degrees. */
export function graticuleStep(span: number): number {
  return STEPS.find((step) => span / step <= 8) ?? 30;
}

/** ``value`` in degrees as a coordinate label (``27.5°N``, ``87.5°W``). */
export function degreesLabel(value: number, axis: 'lat' | 'lon'): string {
  const rounded = Math.round(Math.abs(value) * 100) / 100;
  if (rounded === 0) return '0°';
  const hemisphere = axis === 'lat' ? (value > 0 ? 'N' : 'S') : value > 0 ? 'E' : 'W';
  return `${rounded}°${hemisphere}`;
}

export function graticuleLines(
  west: number,
  south: number,
  east: number,
  north: number,
): { collection: FeatureCollection<LineString>; lons: number[]; lats: number[] } {
  const step = graticuleStep(Math.max(east - west, north - south));
  const lons: number[] = [];
  const lats: number[] = [];
  for (let lon = Math.ceil(west / step) * step; lon <= east; lon += step) lons.push(lon);
  for (let lat = Math.ceil(south / step) * step; lat <= north; lat += step) lats.push(lat);
  const features = [
    ...lons.map((lon) => [
      [lon, Math.max(south - step, -85)],
      [lon, Math.min(north + step, 85)],
    ]),
    ...lats.map((lat) => [
      [west - step, lat],
      [east + step, lat],
    ]),
  ].map((coordinates) => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates },
  }));
  return { collection: { type: 'FeatureCollection', features }, lons, lats };
}

/** A name as drawn beside its point: 7 px right of it, about 6 px per character, and
 * 4 px of clear space after it so neighbouring names do not read as one. */
interface PlacedName {
  key: string;
  text: string;
  x: number;
  y: number;
}

function box(name: PlacedName): [number, number, number, number] {
  const left = name.x + 7;
  return [left, name.y - 8, left + name.text.length * 6 + 12, name.y + 8];
}

/**
 * The names that can be drawn without covering one another, in order: a name whose
 * box overlaps one already kept is left out (it stays in the table and on hover), so
 * the names that are drawn can be read.
 */
export function withoutOverlaps<T extends PlacedName>(names: readonly T[]): T[] {
  const kept: T[] = [];
  const boxes: [number, number, number, number][] = [];
  for (const name of names) {
    const [l, t, r, b] = box(name);
    if (boxes.some(([l2, t2, r2, b2]) => l < r2 && l2 < r && t < b2 && t2 < b)) continue;
    kept.push(name);
    boxes.push([l, t, r, b]);
  }
  return kept;
}
