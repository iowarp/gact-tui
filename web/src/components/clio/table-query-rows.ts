import {
  TransportError,
  type ArtifactTableQueryRequest,
  type ArtifactTableQueryResult,
  type StreamContent,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { z } from 'zod';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useA2uiReferenceSession } from '@/lib/a2ui/reference-session';
import { useA2uiReference } from '@/lib/a2ui/use-a2ui-reference';
import { IMMUTABLE_QUERY, TABLE_QUERY_ROW_LIMIT } from '@/lib/runtime-limits';
import { latestArtifactSource } from '@/lib/streaming/live-source-updates';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ph, t } from '@lingui/core/macro';
import { formatLocale, formatNumber } from '@/lib/locale-format';

/**
 * The shared table-query client for every A2UI component that reads a
 * `dataUri` + `dataQuery` (`clio.chart.v1`, `clio.map.v1`,
 * `clio.data-table.v1`): one bounded `POST /v1/artifacts/{id}/table-query`,
 * reused rather than reimplemented per component (`a2ui-component-design`
 * skill, rule 1 and rule 5). A `study://` source reads a study's live record
 * through `POST /v1/studies/{study}/table-query` with the same request. A named
 * artifact at `@latest` resolves to its current version, whose rows are cached like
 * any fixed version; the resolution is re-read when a new version is recorded
 * (`lib/streaming/live-source-updates.ts`).
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

/**
 * The server's stable per-row key (G0): one value per row in `rows`, same
 * order. `undefined` for inline `data` (no server query ran) and for an
 * aggregated query (grouped rows have no single source row to key by) — a
 * component falls back to the row's own array index as its key in either
 * case (still stable within one render of this same `rows` array).
 */
export interface QueryRowKey {
  column: string;
  values: readonly (string | number)[];
}

export interface TableQueryRows {
  rows: QueryRow[] | undefined;
  loading: boolean;
  refreshing?: boolean;
  retry?: () => void;
  error: string;
  /** Says when the server returned fewer rows than matched (truncated, downsampled, or a later page). */
  note: string;
  /** Rows the query matched before `limit`/downsample, when the server reported it. */
  matchedRows: number | undefined;
  /** Source rows before filters, to distinguish a filtered empty view from an empty dataset. */
  totalRows: number | undefined;
  /** Rows actually returned by this response. */
  returnedRows: number | undefined;
  /** The queried columns' own server-reported types — authoritative over sampling a page for kind. */
  schema: readonly QueryColumnSchema[] | undefined;
  /** The server's stable row key for this result, when it reported one. */
  rowKey: QueryRowKey | undefined;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function artifactIdFromDataUri(uri: string | undefined): string | undefined {
  return uri ? /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(uri)?.[1] : undefined;
}

/** A study's live source named by a `dataUri` (`study://<study>/<source>`). */
export interface StudySource {
  study: string;
  /** `measurements`, `entries` or `records/<name>`. */
  source: string;
}

const STUDY_URI = /^study:\/\/([A-Za-z0-9_-]+)\/(measurements|entries|records\/[A-Za-z0-9_.-]+)$/u;

/**
 * A tabular `dataUri`: a registered artifact, a named artifact at its latest version or
 * a study source (clio-schemas `TABLE_DATA_URI_PATTERN`).
 */
export const TABLE_DATA_URI =
  /^(artifact:\/\/artifact_[A-Za-z0-9_-]+|artifact:\/\/[A-Za-z0-9_-]+\/[^@\s?#]+@latest|study:\/\/[A-Za-z0-9_-]+\/(measurements|entries|records\/[A-Za-z0-9_.-]+))$/u;

export function studySourceFromDataUri(uri: string | undefined): StudySource | undefined {
  const match = uri ? STUDY_URI.exec(uri) : null;
  return match ? { study: match[1]!, source: match[2]! } : undefined;
}

/** The cache key prefix of every source read of one study, for invalidation. */
export function studySourceQueryPrefix(endpoint: string, study: string) {
  return queryKeys.key('study-source', endpoint, study);
}

/**
 * How a study source is cached: never as immutable (a study grows), re-read when an
 * entry of the study merges (`ScienceEntryMerger`) or, for plugin records, when a record
 * row of its view lands (`science.record`, `LiveSourceRefresher`). Nothing polls.
 */
export const STUDY_SOURCE_QUERY = { staleTime: 0 } as const;

/** The cache key prefix of one stream's reads, which its `stream.updated` events refresh. */
export function streamRowsQueryPrefix(endpoint: string, streamId: string) {
  return queryKeys.key('stream-rows', endpoint, streamId);
}

/** How often a view on screen renews its lease on a stream (the lease lasts 30 s). */
export const STREAM_LEASE_RENEW_MS = 15_000;

/** What a stream's state says: live with its last write, closed, or captured. */
export function describeStream(stream: unknown): string {
  if (!isJsonObject(stream)) return '';
  const at = (value: unknown) =>
    typeof value === 'string' && value ? new Date(value).toLocaleTimeString(formatLocale()) : '';
  if (stream.state === 'captured') {
    // An export taken while the stream was written: its entries as they stood then.
    const when = at(stream.captured_at);
    return when
      ? t`Captured at ${when} while live; showing the entries it had then.`
      : t`Captured while live; showing the entries it had then.`;
  }
  if (stream.state === 'closed') {
    const when = at(stream.closed_at) || at(stream.updated_at);
    return when
      ? t`Closed at ${when}; showing its last entries.`
      : t`Closed; showing its last entries.`;
  }
  const last = at(stream.updated_at);
  return last ? t`Live, last update ${last}.` : t`Live, no entries yet.`;
}

/** A stream's JSON record entries as rows (text and binary entries are not rows). */
export function streamRows(content: StreamContent | undefined): QueryRow[] | undefined {
  if (!content) return undefined;
  return content.entries
    .filter((entry) => isJsonObject(entry.value))
    .map((entry) => entry.value as QueryRow);
}

/**
 * Holds this view's session's lease on a stream while the view is shown, so the stream
 * announces its changes to this session; releases it when the view goes.
 */
export function useStreamLease(streamId: string | undefined, sessionId: string | undefined): void {
  const repository = useRepository();
  // Each view holds a lease of its own: one view going away leaves the others watching.
  const [leaseId] = useState(() => crypto.randomUUID());
  // A view's lease requests go one after another, so a release sent as the view remounts
  // (a tab switch, or React's development double mount) cannot land after the new lease.
  const requests = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    if (!streamId || !sessionId) return undefined;
    const send = (release: boolean) => {
      requests.current = requests.current
        .then(() => repository.watchStream(streamId, sessionId, release, undefined, leaseId))
        .catch(() => undefined);
    };
    send(false);
    const timer = window.setInterval(() => send(false), STREAM_LEASE_RENEW_MS);
    return () => {
      window.clearInterval(timer);
      send(true);
    };
  }, [repository, streamId, sessionId, leaseId]);
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
  const matched = result.matchedRows ?? result.totalRows;
  // A producer may request sampling for a small result. If every matching row
  // came back, the view has not actually been reduced.
  const downsampled = mode !== 'none' && result.returnedRows < matched;
  if (!downsampled && !result.truncated && !requestedOffset) return '';
  const shown = formatNumber(result.returnedRows);
  const total = formatNumber(matched);
  const method = mode.replaceAll('_', ' ');
  if (downsampled && result.truncated)
    return t`Showing ${shown} of ${total} rows, downsampled (${method}), cut at the row limit.`;
  if (downsampled) return t`Showing ${shown} of ${total} rows, downsampled (${method}).`;
  if (result.truncated) return t`Showing ${shown} of ${total} rows, cut at the row limit.`;
  return t`Showing ${shown} of ${total} rows.`;
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
      return listed(details.missing)
        ? t`the table has no column ${ph({ columns: listed(details.missing) })}.`
        : t`the table has no column named in the query.`;
    case 'limit_exceeds_ceiling':
      return t`the query asks for ${ph({ limit: details.limit == null ? t`more` : String(details.limit) })} rows; this server returns at most ${ph({ max_rows: details.max_rows == null ? t`fewer` : String(details.max_rows) })}.`;
    case 'unsupported_media_type':
      return t`the artifact is not a CSV or Parquet table.`;
    case 'artifact_too_large':
      return t`the table is larger than this server will query.`;
    case 'table_query_timeout':
      return t`the query took longer than the server allows.`;
    case 'not_found':
      return t`the artifact is not in this workspace.`;
    case 'study_not_found':
      return t`the study is not on this server.`;
    case 'study_uri_invalid':
      return t`the study source is not measurements, entries or records/<name>.`;
    case 'validation_error': {
      const first = Array.isArray(details.errors) ? details.errors[0] : undefined;
      if (isJsonObject(first) && typeof first.msg === 'string') {
        const where = Array.isArray(first.loc) ? first.loc.slice(1).join('.') : '';
        return where
          ? t`the server refused the data query at ${where}: ${ph({ reason: first.msg })}`
          : t`the server refused the data query: ${ph({ reason: first.msg })}`;
      }
      return t`the server refused the data query: ${ph({ reason: error.message })}`;
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
  const live = !data && latestArtifactSource(dataUri) ? dataUri : undefined;
  const liveReference = useA2uiReference(live ?? '', { readBytes: false, enabled: Boolean(live) });
  const artifactId = artifactIdFromDataUri(dataUri) ?? liveReference.resolution?.artifact_id;
  // A named artifact that is a stream: its entries are read as they are, from clio-core.
  const liveStream = live ? liveReference.resolution?.stream : undefined;
  useStreamLease(liveStream?.stream_id, useA2uiReferenceSession());
  const limit = Math.min(dataQuery?.limit ?? TABLE_QUERY_ROW_LIMIT, TABLE_QUERY_ROW_LIMIT);
  // The producer's query goes out as written (its shape is the server's); the
  // row budget is always filled in, and the projection only when the caller
  // (or the producer's own dataQuery.columns) named one — an omitted
  // `columns` asks the server for every column of the referenced table.
  const request = useMemo<ArtifactTableQueryRequest>(
    () => ({ ...dataQuery, ...(columns.length ? { columns } : {}), limit }),
    [columns, dataQuery, limit],
  );
  const study = artifactId || live ? undefined : studySourceFromDataUri(dataUri);
  const studyQuery = useQuery({
    enabled: !data && Boolean(study),
    queryKey: [
      ...studySourceQueryPrefix(settings.endpoint, study?.study ?? ''),
      study?.source,
      JSON.stringify(request),
    ],
    queryFn: ({ signal }) =>
      repository.studyTableQuery(study!.study, study!.source, request, signal),
    retry: retryTableQuery,
    // A refetch keeps the rows on screen; a different source shows its own loading.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === study?.study && previousQuery?.queryKey[3] === study?.source
        ? previousData
        : undefined,
    ...STUDY_SOURCE_QUERY,
  });
  const streamQuery = useQuery({
    enabled: !data && Boolean(liveStream),
    queryKey: streamRowsQueryPrefix(settings.endpoint, liveStream?.stream_id ?? ''),
    queryFn: ({ signal }) => repository.streamContent(liveStream!.content_path, signal),
    retry: retryTableQuery,
    // Each update keeps the previous entries on screen until the next ones arrive.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === liveStream?.stream_id ? previousData : undefined,
    staleTime: 0,
  });
  const streamed = useMemo(() => streamRows(streamQuery.data), [streamQuery.data]);
  const artifactQuery = useQuery({
    enabled: !data && Boolean(artifactId) && !liveStream,
    queryKey: queryKeys.key(
      'artifact-table-query',
      settings.endpoint,
      artifactId,
      JSON.stringify(request),
      live ?? '',
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
    // A live source's next version keeps its previous version's rows on screen too.
    placeholderData: (previousData, previousQuery) =>
      previousQuery?.queryKey[2] === artifactId || (live && previousQuery?.queryKey[4] === live)
        ? previousData
        : undefined,
    ...IMMUTABLE_QUERY,
  });
  const query = study ? studyQuery : artifactQuery;
  const queried = useMemo(
    () =>
      query.data
        ? columnarToRows(
            query.data.columns as Record<string, QueryCell[]>,
            query.data.returnedRows,
          ).map((row, index) =>
            query.data?.rowKey?.values[index] === undefined
              ? row
              : { ...row, [query.data.rowKey.column]: query.data.rowKey.values[index]! },
          )
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
      totalRows: data.length,
      returnedRows: data.length,
      schema: undefined,
      rowKey: undefined,
    };
  }
  if (live && !artifactId) {
    const failure = liveReference.failure;
    return {
      rows: undefined,
      loading: !failure,
      error: failure ? failure.message : '',
      note: '',
      matchedRows: undefined,
      totalRows: undefined,
      returnedRows: undefined,
      schema: undefined,
      rowKey: undefined,
    };
  }
  if (liveStream) {
    return {
      rows: streamed,
      loading: streamQuery.isPending,
      refreshing: streamQuery.isFetching && !streamQuery.isPending,
      retry: () => void streamQuery.refetch(),
      error: streamQuery.isError ? tableQueryErrorMessage(streamQuery.error) : '',
      note: streamQuery.data ? describeStream(streamQuery.data.stream) : '',
      matchedRows: streamed?.length,
      totalRows: streamed?.length,
      returnedRows: streamed?.length,
      schema: undefined,
      rowKey: undefined,
    };
  }
  if (!artifactId && !study) {
    return {
      rows: undefined,
      loading: false,
      error: 'the data source is not a registered artifact id or a study source.',
      note: '',
      matchedRows: undefined,
      totalRows: undefined,
      returnedRows: undefined,
      schema: undefined,
      rowKey: undefined,
    };
  }
  if (query.isError) {
    return {
      rows: undefined,
      loading: false,
      error: tableQueryErrorMessage(query.error),
      retry: () => void query.refetch(),
      note: '',
      matchedRows: undefined,
      totalRows: undefined,
      returnedRows: undefined,
      schema: undefined,
      rowKey: undefined,
    };
  }
  return {
    rows: queried,
    loading: query.isPending,
    refreshing: query.isFetching && !query.isPending,
    retry: () => void query.refetch(),
    error: '',
    note: query.data
      ? [describeResult(query.data, (dataQuery?.offset ?? 0) > 0)].filter(Boolean).join(' ')
      : '',
    matchedRows: query.data ? (query.data.matchedRows ?? query.data.totalRows) : undefined,
    totalRows: query.data?.totalRows,
    returnedRows: query.data?.returnedRows,
    rowKey: query.data?.rowKey,
    schema: query.data?.schema as readonly QueryColumnSchema[] | undefined,
  };
}
