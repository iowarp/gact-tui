import {
  TransportError,
  type ArtifactTableQueryRequest,
  type ArtifactTableQueryResult,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { z } from 'zod';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { IMMUTABLE_QUERY, TABLE_QUERY_ROW_LIMIT } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * The shared table-query client for every A2UI component that reads a
 * `dataUri` + `dataQuery` (`clio.chart.v1`, `clio.map.v1`,
 * `clio.data-table.v1`): one bounded `POST /v1/artifacts/{id}/table-query`,
 * reused rather than reimplemented per component (`a2ui-component-design`
 * skill, rule 1 and rule 5).
 */

/**
 * RFC 7946 §3.1 Geometry object, strictly shaped exactly like clio-schemas'
 * `$defs/GeoJsonGeometry` (`clio_schemas.a2ui.catalog_bounded`) and the
 * matching discriminated pydantic union
 * (`clio_schemas.a2ui.v0_9_1.bounded_components.GeoJsonGeometry`) — never a
 * Feature/FeatureCollection, never a bare coordinate array. A table-query
 * cell or an inline `clio.chart.v1` `data` cell may be one of these (issue
 * #1549 G4 — a geoshape mark can then draw real shapes from a geometry
 * column). The server actually emitting one from a `.geojson` artifact by
 * `dataUri` is a later slice (#1549 G7); today only inline `data` can carry
 * one in practice.
 */
export type GeoJsonGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'GeometryCollection'; geometries: GeoJsonGeometry[] };

const geoJsonPosition = z.array(z.number()).min(2).max(3);
const geoJsonLinearRing = z.array(geoJsonPosition).min(4);

/** Zod mirror of {@link GeoJsonGeometry} — the one runtime check for the shape above. */
export const geoJsonGeometrySchema: z.ZodType<GeoJsonGeometry> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('Point'), coordinates: geoJsonPosition }).strict(),
    z.object({ type: z.literal('MultiPoint'), coordinates: z.array(geoJsonPosition) }).strict(),
    z
      .object({ type: z.literal('LineString'), coordinates: z.array(geoJsonPosition).min(2) })
      .strict(),
    z
      .object({
        type: z.literal('MultiLineString'),
        coordinates: z.array(z.array(geoJsonPosition).min(2)),
      })
      .strict(),
    z.object({ type: z.literal('Polygon'), coordinates: z.array(geoJsonLinearRing) }).strict(),
    z
      .object({
        type: z.literal('MultiPolygon'),
        coordinates: z.array(z.array(geoJsonLinearRing)),
      })
      .strict(),
    z
      .object({
        type: z.literal('GeometryCollection'),
        geometries: z.array(z.lazy(() => geoJsonGeometrySchema)),
      })
      .strict(),
  ]),
);

export type QueryCell = string | number | boolean | null | GeoJsonGeometry;
export type QueryRow = Record<string, QueryCell>;

/**
 * `$defs/DataQuery`, as the producer wrote it: the table-query request
 * itself, with `columns` and `limit` optional (the renderer fills them in).
 */
export type TableDataQuery = Partial<ArtifactTableQueryRequest>;

/** One column's name and the server's own Arrow-derived type string (e.g. `int64`, `string`, `timestamp[us]`). */
export interface QueryColumnSchema {
  name: string;
  type: string;
}

export interface TableQueryRows {
  rows: QueryRow[] | undefined;
  loading: boolean;
  error: string;
  /** Says when the server returned fewer rows than matched (truncated, downsampled, or a later page). */
  note: string;
  /** Rows the query matched before `limit`/downsample, when the server reported it. */
  matchedRows: number | undefined;
  /** Rows actually returned by this response. */
  returnedRows: number | undefined;
  /** The queried columns' own server-reported types — authoritative over sampling a page for kind. */
  schema: readonly QueryColumnSchema[] | undefined;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function artifactIdFromDataUri(uri: string | undefined): string | undefined {
  return uri ? /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(uri)?.[1] : undefined;
}

/** Columnar `{name: values[]}` to row objects (`count` rows). */
export function columnarToRows(
  columns: Readonly<Record<string, readonly QueryCell[]>>,
  count: number,
): QueryRow[] {
  const names = Object.keys(columns);
  const rows: QueryRow[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const row: QueryRow = {};
    for (const name of names) row[name] = columns[name]![index] ?? null;
    rows[index] = row;
  }
  return rows;
}

/**
 * `offset` is true whenever the request named one (regardless of its value):
 * a chart/map has no pagination UI of its own, so a paged request — even one
 * whose page happens to come back whole (not `truncated`) — still needs its
 * own "N of M" note, or a producer's `offset` would read as the WHOLE result.
 */
function describeResult(result: ArtifactTableQueryResult, requestedOffset: boolean): string {
  const mode = typeof result.downsample.mode === 'string' ? result.downsample.mode : 'none';
  const downsampled = mode !== 'none';
  if (!downsampled && !result.truncated && !requestedOffset) return '';
  const matched = result.matchedRows ?? result.totalRows;
  const parts = [
    `Showing ${result.returnedRows.toLocaleString()} of ${matched.toLocaleString()} rows`,
  ];
  if (downsampled) parts.push(`downsampled (${mode.replaceAll('_', ' ')})`);
  if (result.truncated) parts.push('cut at the row limit');
  return `${parts.join(', ')}.`;
}

function detailsOf(error: TransportError): Record<string, unknown> {
  return isJsonObject(error.details) ? error.details : {};
}

function listed(value: unknown): string {
  return Array.isArray(value) ? value.map((item) => `“${String(item)}”`).join(', ') : '';
}

/**
 * The table-query server's typed errors, stated for the reader. Unknown
 * columns and an over-ceiling limit are the producer's to fix; the rest are
 * about the artifact or the server.
 */
export function tableQueryErrorMessage(error: Error): string {
  if (!(error instanceof TransportError)) return error.message;
  const details = detailsOf(error);
  switch (error.code) {
    case 'columns_not_found':
      return `the table has no column ${listed(details.missing) || 'named in the query'}.`;
    case 'limit_exceeds_ceiling':
      return `the query asks for ${String(details.limit ?? 'more')} rows; this server returns at most ${String(details.max_rows ?? 'fewer')}.`;
    case 'unsupported_media_type':
      return 'the artifact is not a CSV or Parquet table.';
    case 'artifact_too_large':
      return 'the table is larger than this server will query.';
    case 'table_query_timeout':
      return 'the query took longer than the server allows.';
    case 'not_found':
      return 'the artifact is not in this workspace.';
    case 'validation_error': {
      const first = Array.isArray(details.errors) ? details.errors[0] : undefined;
      if (isJsonObject(first) && typeof first.msg === 'string') {
        const where = Array.isArray(first.loc) ? first.loc.slice(1).join('.') : '';
        return `the server refused the data query${where ? ` at ${where}` : ''}: ${first.msg}`;
      }
      return `the server refused the data query: ${error.message}`;
    }
    default:
      return error.message;
  }
}

/** Retry only what can change on its own: never a refused (4xx) query. */
function retryTableQuery(failures: number, error: Error): boolean {
  const status = error instanceof TransportError ? error.status : undefined;
  return failures < 2 && !(status !== undefined && status >= 400 && status < 500);
}

/** Inline rows as given, or one bounded table query for an artifact. */
export function useTableQueryRows({
  columns,
  data,
  dataQuery,
  dataUri,
}: {
  columns: readonly string[];
  data: QueryRow[] | undefined;
  dataQuery: TableDataQuery | undefined;
  dataUri: string | undefined;
}): TableQueryRows {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = artifactIdFromDataUri(dataUri);
  const limit = Math.min(dataQuery?.limit ?? TABLE_QUERY_ROW_LIMIT, TABLE_QUERY_ROW_LIMIT);
  // The producer's query goes out as written (its shape is the server's); the
  // row budget is always filled in, and the projection only when the caller
  // (or the producer's own dataQuery.columns) named one — an omitted
  // `columns` asks the server for every column of the referenced table.
  const request = useMemo<ArtifactTableQueryRequest>(
    () => ({ ...dataQuery, ...(columns.length ? { columns } : {}), limit }),
    [columns, dataQuery, limit],
  );
  const query = useQuery({
    enabled: !data && Boolean(artifactId),
    queryKey: queryKeys.key(
      'artifact-table-query',
      settings.endpoint,
      artifactId,
      JSON.stringify(request),
    ),
    queryFn: ({ signal }) => repository.artifactTableQuery(artifactId!, request, signal),
    retry: retryTableQuery,
    // Keeps the previous page/sort/filter's rows on screen while the next
    // request for the SAME artifact is in flight — paging, sorting, and
    // filtering read as a live table adjusting, not a flash back to a
    // loading skeleton every click. Scoped to the artifact id (queryKey[2],
    // set just above): unscoped `keepPreviousData` would keep showing a
    // just-replaced artifact's own rows as "settled" placeholder data the
    // instant a producer points `dataUri` at a different one, rather than
    // the loading state a genuinely different dataset should show.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === artifactId ? previousData : undefined,
    ...IMMUTABLE_QUERY,
  });
  const queried = useMemo(
    () =>
      query.data
        ? columnarToRows(query.data.columns as Record<string, QueryCell[]>, query.data.returnedRows)
        : undefined,
    [query.data],
  );

  if (data) {
    return {
      rows: data,
      loading: false,
      error: '',
      note: '',
      matchedRows: data.length,
      returnedRows: data.length,
      schema: undefined,
    };
  }
  if (!artifactId) {
    return {
      rows: undefined,
      loading: false,
      error: 'the data source is not a registered artifact id.',
      note: '',
      matchedRows: undefined,
      returnedRows: undefined,
      schema: undefined,
    };
  }
  if (query.isError) {
    return {
      rows: undefined,
      loading: false,
      error: tableQueryErrorMessage(query.error),
      note: '',
      matchedRows: undefined,
      returnedRows: undefined,
      schema: undefined,
    };
  }
  return {
    rows: queried,
    loading: query.isPending,
    error: '',
    note: query.data ? describeResult(query.data, (dataQuery?.offset ?? 0) > 0) : '',
    matchedRows: query.data ? (query.data.matchedRows ?? query.data.totalRows) : undefined,
    returnedRows: query.data?.returnedRows,
    schema: query.data?.schema as readonly QueryColumnSchema[] | undefined,
  };
}
