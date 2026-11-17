import type { Feature, FeatureCollection, Geometry, LineString, Point, Polygon } from 'geojson';
import { z } from 'zod';
import type { Colormap } from '@/theme/data-scales';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import { parseSelectionState, type SelectionState } from './selection-state';
import { TABLE_DATA_URI, type QueryRow } from './table-query-rows';

/**
 * The pure half of `clio.layered-map.v1` (clio-schemas `MapLayer`): layer
 * shapes, the shared time axis, rows to features, and the geometry the person
 * draws. Kept apart from the view so it is tested without a map.
 */
export const FIELD_COLORMAPS = [
  'viridis',
  'magma',
  'plasma',
  'cividis',
  'turbo',
  'grayscale',
  'balance',
] as const satisfies readonly Colormap[];

const ARTIFACT_URI = /^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u;

export const mapLayerSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/u),
    kind: z.enum(['grid', 'points', 'tracks', 'shapes']),
    label: z.string().min(1).max(80),
    visible: z.boolean().optional(),
    opacity: z.number().min(0).max(1).optional(),
    gridUri: z.string().regex(ARTIFACT_URI).optional(),
    variable: fieldNameSchema.optional(),
    timeDimension: fieldNameSchema.optional(),
    fixed: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
    dataUri: z.string().regex(TABLE_DATA_URI).optional(),
    dataQuery: dataQuerySchema.optional(),
    latitudeField: fieldNameSchema.optional(),
    longitudeField: fieldNameSchema.optional(),
    idField: fieldNameSchema.optional(),
    labelField: fieldNameSchema.optional(),
    timeField: fieldNameSchema.optional(),
    trackField: fieldNameSchema.optional(),
    categoryField: fieldNameSchema.optional(),
    valueField: fieldNameSchema.optional(),
    editable: z.boolean().optional(),
    geojsonUri: z.string().regex(ARTIFACT_URI).optional(),
    colormap: z.enum(FIELD_COLORMAPS).optional(),
    valueRange: z.tuple([z.number(), z.number()]).optional(),
    unit: z.string().max(40).optional(),
  })
  .strict()
  .superRefine((layer, context) => {
    const source = { grid: 'gridUri', points: 'dataUri', tracks: 'dataUri', shapes: 'geojsonUri' }[
      layer.kind
    ] as 'gridUri' | 'dataUri' | 'geojsonUri';
    // i18n-ignore: validation message returned to the agent
    if (!layer[source])
      // i18n-ignore: validation message returned to the agent
      context.addIssue({ code: 'custom', message: `a ${layer.kind} layer needs ${source}` });
    const others = (['gridUri', 'dataUri', 'geojsonUri'] as const).filter(
      (name) => name !== source && layer[name],
    );
    if (others.length)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        // i18n-ignore: validation message returned to the agent
        message: `a ${layer.kind} layer takes no ${others.join(', ')}`,
      });
    if (layer.kind === 'grid' && !layer.variable)
      // i18n-ignore: validation message returned to the agent
      context.addIssue({ code: 'custom', message: 'a grid layer needs variable' });
    if (layer.kind === 'points' || layer.kind === 'tracks') {
      const missing = (['latitudeField', 'longitudeField', 'idField'] as const).filter(
        (name) => !layer[name],
      );
      if (missing.length)
        // i18n-ignore: validation message returned to the agent
        context.addIssue({
          code: 'custom',
          // i18n-ignore: validation message returned to the agent
          message: `a ${layer.kind} layer needs ${missing.join(', ')}`,
        });
    }
    if (layer.kind === 'tracks' && (!layer.trackField || !layer.timeField))
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        // i18n-ignore: validation message returned to the agent
        message: 'a tracks layer needs trackField and timeField',
      });
    if (layer.editable && layer.kind !== 'points')
      // i18n-ignore: validation message returned to the agent
      context.addIssue({ code: 'custom', message: 'only a points layer can be editable' });
    if (layer.valueRange && !(layer.valueRange[0] < layer.valueRange[1]))
      // i18n-ignore: validation message returned to the agent
      context.addIssue({
        code: 'custom',
        // i18n-ignore: validation message returned to the agent
        message: 'valueRange must be [low, high] with low < high',
      });
  });

export type MapLayer = z.infer<typeof mapLayerSchema>;
export type DrawMode = 'box' | 'path' | 'point';

/** A time as epoch milliseconds, or undefined when it does not parse. */
export function timeValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value) return undefined;
  const parsed = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/u.test(value) ? value : `${value}Z`);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** ISO text for a time in epoch milliseconds, without fractional seconds. */
export function isoTime(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

/** Every distinct time across the layers, sorted. */
export function mergeTimes(lists: readonly (readonly unknown[])[]): number[] {
  const seen = new Set<number>();
  for (const list of lists)
    for (const value of list) {
      const ms = timeValue(value);
      if (ms !== undefined) seen.add(ms);
    }
  return [...seen].sort((left, right) => left - right);
}

/** The time the shared selection names, else undefined. */
export function selectedTime(selection: unknown): number | undefined {
  const state = parseSelectionState(selection);
  return state ? timeValue(state.values[0]) : undefined;
}

/** The latest axis time at or before `wanted` (or the first time). */
export function frameAt(times: readonly number[], wanted: number | undefined): number | undefined {
  if (!times.length) return undefined;
  if (wanted === undefined) return times[times.length - 1];
  let chosen = times[0];
  for (const time of times) if (time <= wanted) chosen = time;
  return chosen;
}

export function timeSelection(field: string, ms: number, source: string): SelectionState {
  return { field, values: [isoTime(ms)], source };
}

function numberCell(row: QueryRow, field: string | undefined): number | undefined {
  if (!field) return undefined;
  const value = row[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function textCell(row: QueryRow, field: string | undefined): string | undefined {
  if (!field) return undefined;
  const value = row[field];
  return value === null || value === undefined || typeof value === 'object'
    ? undefined
    : String(value);
}

export interface FeatureProperties {
  layer: string;
  id: string;
  label?: string;
  category?: string;
  value?: number;
  time?: number;
  head?: boolean;
}

/**
 * Points or tracks as GeoJSON at the current time. Points with a time field
 * show the rows of the latest time at or before `now`; tracks show each track
 * up to `now`, with its current position marked as the head. Without a time
 * field every row shows.
 */
export function layerFeatures(
  layer: MapLayer,
  rows: readonly QueryRow[],
  now: number | undefined,
): FeatureCollection<Point | LineString, FeatureProperties> {
  const features: Feature<Point | LineString, FeatureProperties>[] = [];
  const positioned = rows
    .map((row) => ({
      row,
      lon: numberCell(row, layer.longitudeField),
      lat: numberCell(row, layer.latitudeField),
      time: layer.timeField ? timeValue(row[layer.timeField]) : undefined,
    }))
    .filter(
      (entry): entry is typeof entry & { lon: number; lat: number } =>
        entry.lon !== undefined && entry.lat !== undefined,
    );
  const base = (row: QueryRow, time: number | undefined): FeatureProperties => ({
    layer: layer.id,
    id: textCell(row, layer.idField) ?? '',
    label: textCell(row, layer.labelField),
    category: textCell(row, layer.categoryField),
    value: numberCell(row, layer.valueField),
    time,
  });
  if (layer.kind === 'tracks') {
    const tracks = new Map<string, typeof positioned>();
    for (const entry of positioned) {
      const key = textCell(entry.row, layer.trackField) ?? '';
      tracks.set(key, [...(tracks.get(key) ?? []), entry]);
    }
    for (const [key, entries] of tracks) {
      const ordered = entries
        .filter((entry) => now === undefined || entry.time === undefined || entry.time <= now)
        .sort((left, right) => (left.time ?? 0) - (right.time ?? 0));
      if (!ordered.length) continue;
      const head = ordered[ordered.length - 1]!;
      if (ordered.length > 1)
        features.push({
          type: 'Feature',
          geometry: {
            type: 'LineString',
            coordinates: ordered.map((entry) => [entry.lon, entry.lat]),
          },
          properties: { ...base(head.row, head.time), id: key },
        });
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [head.lon, head.lat] },
        properties: { ...base(head.row, head.time), id: key, head: true },
      });
    }
    return { type: 'FeatureCollection', features };
  }
  const times = positioned
    .map((entry) => entry.time)
    .filter((time): time is number => time !== undefined);
  const frame = layer.timeField
    ? frameAt(
        [...new Set(times)].sort((a, b) => a - b),
        now,
      )
    : undefined;
  for (const entry of positioned) {
    if (frame !== undefined && entry.time !== frame) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [entry.lon, entry.lat] },
      properties: base(entry.row, entry.time),
    });
  }
  return { type: 'FeatureCollection', features };
}

/** The GeoJSON geometry a finished drawing writes to the data model. */
export function drawnGeometry(
  mode: DrawMode,
  vertices: readonly [number, number][],
): Geometry | undefined {
  if (mode === 'point')
    return vertices.length ? { type: 'Point', coordinates: vertices[0]! } : undefined;
  if (mode === 'path')
    return vertices.length >= 2
      ? ({ type: 'LineString', coordinates: [...vertices] } as LineString)
      : undefined;
  if (vertices.length < 2) return undefined;
  const [a, b] = [vertices[0]!, vertices[vertices.length - 1]!];
  const [west, east] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
  const [south, north] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  if (west === east || south === north) return undefined;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    ],
  } as Polygon;
}

export interface PointEdit {
  layer: string;
  id: string;
  longitude: number;
  latitude: number;
}

/** The edits list after moving one point: one entry per point, the latest position. */
export function withEdit(edits: unknown, next: PointEdit): PointEdit[] {
  const list = Array.isArray(edits) ? (edits as PointEdit[]) : [];
  return [...list.filter((edit) => !(edit.layer === next.layer && edit.id === next.id)), next];
}

/** Rows with any moved points at their edited positions. */
export function applyEdits(layer: MapLayer, rows: readonly QueryRow[], edits: unknown): QueryRow[] {
  if (!layer.editable || !Array.isArray(edits) || !layer.idField) return [...rows];
  const moved = new Map(
    (edits as PointEdit[]).filter((edit) => edit.layer === layer.id).map((edit) => [edit.id, edit]),
  );
  return rows.map((row) => {
    const edit = moved.get(String(row[layer.idField!]));
    return edit
      ? { ...row, [layer.longitudeField!]: edit.longitude, [layer.latitudeField!]: edit.latitude }
      : row;
  });
}

export { dataQuerySchema };
