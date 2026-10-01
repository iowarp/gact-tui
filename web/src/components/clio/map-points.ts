import type { ScientificMapPoint } from './scientific-map-view';
import type { SelectionValue } from './selection-state';
import type { QueryRow } from './table-query-rows';

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
  detailField?: string;
  categoryField?: string;
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
    if (latitude === undefined || longitude === undefined || !label) return;
    const id = fields.idField ? toText(row[fields.idField]) : undefined;
    points.push({
      id: id ?? `row-${index}`,
      label,
      latitude,
      longitude,
      detail: fields.detailField ? toText(row[fields.detailField]) : undefined,
      category: fields.categoryField ? toText(row[fields.categoryField]) : undefined,
      selectionValue: fields.selectionField
        ? toSelectionValue(row[fields.selectionField])
        : undefined,
    });
  });
  return points;
}
