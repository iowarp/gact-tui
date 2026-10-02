import type { ScientificMapPoint } from './scientific-map-view';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
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
