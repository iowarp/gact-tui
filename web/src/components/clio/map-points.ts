import type { ScientificMapPoint } from './scientific-map-view';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import type { MapLibreMap } from 'maplibre-gl';
import type { SelectionValue } from './selection-state';
import type { QueryRow } from './table-query-rows';

const SELECTABLE_POINT_FIELDS = ['id', 'label', 'category'] as const;
type SelectablePointField = (typeof SELECTABLE_POINT_FIELDS)[number];

export function isSelectablePointField(field: string): field is SelectablePointField {
  return (SELECTABLE_POINT_FIELDS as readonly string[]).includes(field);
}

/** Prefer the data column's selection value over the point's display identity. */
export function pointSelectValue(point: ScientificMapPoint, field: string): SelectionValue | undefined {
  if (point.selectionValue !== undefined) return point.selectionValue;
  if (field === 'id') return point.id;
  if (field === 'label') return point.label;
  if (field === 'category') return point.category;
  return undefined;
}

/** Clicking any observation selects its track; Shift toggles that entire track. */
export function mapClickSelectionValues(
  points: readonly ScientificMapPoint[],
  id: string,
  field: string,
  previous: readonly SelectionValue[],
  additive: boolean,
): SelectionValue[] {
  const point = points.find((candidate) => candidate.id === id);
  if (!point) return [];
  const group = point.track
    ? points.filter((candidate) => candidate.track === point.track)
    : [point];
  const values = [...new Set(group.map((candidate) => pointSelectValue(candidate, field)))].filter(
    (value): value is SelectionValue => typeof value === 'string' || typeof value === 'number',
  );
  if (!additive) return values;
  return values.every((value) => previous.includes(value))
    ? previous.filter((value) => !values.includes(value))
    : [...new Set([...previous, ...values])];
}

/** Find a visible dot or line segment when MapLibre's feature hit index is briefly stale. */
export function nearestProjectedGeometryId(
  map: Pick<MapLibreMap, 'project'>,
  cursor: { x: number; y: number },
  points: readonly ScientificMapPoint[],
  geometry: FeatureCollection,
): string | undefined {
  let closest = 14;
  let selected: string | undefined;
  for (const point of points) {
    const pixel = map.project([point.longitude, point.latitude]);
    const distance = Math.hypot(pixel.x - cursor.x, pixel.y - cursor.y);
    if (distance <= closest) {
      closest = distance;
      selected = point.id;
    }
  }
  if (selected) return selected;
  closest = 8;
  for (const feature of geometry.features) {
    if (feature.geometry.type !== 'LineString' || feature.id === undefined) continue;
    const coordinates = feature.geometry.coordinates;
    for (let index = 1; index < coordinates.length; index += 1) {
      const start = coordinates[index - 1]!;
      const end = coordinates[index]!;
      const a = map.project([start[0]!, start[1]!]);
      const b = map.project([end[0]!, end[1]!]);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const portion = dx || dy
        ? Math.max(0, Math.min(1, ((cursor.x - a.x) * dx + (cursor.y - a.y) * dy) / (dx * dx + dy * dy)))
        : 0;
      const distance = Math.hypot(cursor.x - (a.x + portion * dx), cursor.y - (a.y + portion * dy));
      if (distance <= closest) {
        closest = distance;
        selected = String(feature.id);
      }
    }
  }
  return selected;
}

/**
 * Shared between `a2ui-map.tsx` (the renderer, both the inline-`points` and
 * `dataUri` paths) and `a2ui-map-data-source.tsx` (the `dataUri` data-fetch
 * wrapper) — its own module so the two don't import each other (a cycle).
 */

function toFiniteNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toText(value: unknown): string | undefined {
  return value === null || value === undefined ? undefined : String(value);
}

function toSelectionValue(value: unknown): SelectionValue | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  return typeof value === 'string' ? value : undefined;
}

export interface MapFieldNames {
  latitudeField: string;
  longitudeField: string;
  labelField: string;
  idField?: string;
  trackField?: string;
  orderField?: string;
  detailField?: string;
  categoryField?: string;
  valueField?: string;
  /** A dataset column read into each point's `selectionValue` (a bound selection's key). */
  selectionField?: string;
}

/**
 * Maps queried rows to map points by the producer's `*Field` column names. A
 * row missing a finite latitude/longitude or a label is skipped rather than
 * drawn wrong; a row with no `idField` gets a stable synthetic id from its
 * position in the (server-ordered) result — never used for a bound
 * selection, which reads and writes `selectionField` (required by the schema
 * whenever `selection` is bound) instead.
 */
export function pointsFromRows(
  rows: readonly QueryRow[],
  fields: MapFieldNames,
): ScientificMapPoint[] {
  const points: ScientificMapPoint[] = [];
  rows.forEach((row, index) => {
    const latitude = toFiniteNumber(row[fields.latitudeField]);
    const longitude = toFiniteNumber(row[fields.longitudeField]);
    const label = toText(row[fields.labelField]);
    if (latitude === undefined || Math.abs(latitude) > 90 || longitude === undefined || !label) return;
    // Longitude outside the canonical range occurs in some track archives.
    // Normalizing it keeps the map bounds and the rendered point together.
    const normalizedLongitude = longitude >= -180 && longitude <= 180
      ? longitude
      : ((longitude + 180) % 360 + 360) % 360 - 180;
    const id = fields.idField ? toText(row[fields.idField]) : undefined;
    points.push({
      id: id ?? `row-${index}`,
      rowIndex: index,
      label,
      latitude,
      longitude: normalizedLongitude,
      detail: fields.detailField ? toText(row[fields.detailField]) : undefined,
      category: fields.categoryField ? toText(row[fields.categoryField]) : undefined,
      value: fields.valueField ? toFiniteNumber(row[fields.valueField]) : undefined,
      selectionValue: fields.selectionField
        ? toSelectionValue(row[fields.selectionField])
        : undefined,
    });
  });
  return points;
}

/** Join timestamped table positions without asking the producer to serialize paths. */
export function trajectoriesFromRows(
  rows: readonly QueryRow[],
  points: readonly ScientificMapPoint[],
  trackField: string,
  orderField: string,
): FeatureCollection {
  type Position = { point: ScientificMapPoint; order: string | number; index: number };
  const tracks = new Map<string, Position[]>();
  for (const point of points) {
    const index = point.rowIndex;
    if (index === undefined) continue;
    const row = rows[index];
    const track = row?.[trackField];
    const order = row?.[orderField];
    if ((typeof track !== 'string' && typeof track !== 'number') ||
      (typeof order !== 'string' && typeof order !== 'number')) continue;
    const key = String(track);
    const group = tracks.get(key) ?? [];
    group.push({ point, order, index });
    tracks.set(key, group);
  }
  const features: Array<Feature<LineString | Point>> = [];
  for (const [track, positions] of tracks) {
    positions.sort((a, b) => {
      const delta = typeof a.order === 'number' && typeof b.order === 'number'
        ? a.order - b.order
        : String(a.order).localeCompare(String(b.order), undefined, { numeric: true });
      return delta || a.index - b.index;
    });
    positions.forEach(({ point }, index) => {
      if (index > 0) {
        const previous = positions[index - 1]!.point;
        if (Math.abs(previous.longitude - point.longitude) <= 180) {
          features.push({
            type: 'Feature', id: point.id,
            geometry: { type: 'LineString', coordinates: [
              [previous.longitude, previous.latitude], [point.longitude, point.latitude],
            ] },
            properties: { track },
          });
        }
      }
      features.push({
        type: 'Feature', id: point.id,
        geometry: { type: 'Point', coordinates: [point.longitude, point.latitude] },
        properties: { track, endpoint: index === positions.length - 1 },
      });
    });
  }
  return { type: 'FeatureCollection', features };
}
