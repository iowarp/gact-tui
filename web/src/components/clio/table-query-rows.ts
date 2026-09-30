import {
  TransportError,
  type ArtifactTableQueryRequest,
  type ArtifactTableQueryResult,
} from '@clio/core/v3';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
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

export type QueryCell = string | number | boolean | null;
export type QueryRow = Record<string, QueryCell>;

/**
 * `$defs/DataQuery`, as the producer wrote it: the table-query request
 * itself, with `columns` and `limit` optional (the renderer fills them in).
 */
export type TableDataQuery = Partial<ArtifactTableQueryRequest>;

export interface TableQueryRows {
  rows: QueryRow[] | undefined;
  loading: boolean;
  error: string;
  /** Says when the server returned fewer rows than matched (truncated or downsampled). */
  note: string;
  /** Rows the query matched before `limit`/downsample, when the server reported it. */
  matchedRows: number | undefined;
  /** Rows actually returned by this response. */
  returnedRows: number | undefined;
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

function describeResult(result: ArtifactTableQueryResult): string {
  const mode = typeof result.downsample.mode === 'string' ? result.downsample.mode : 'none';
  const downsampled = mode !== 'none';
  if (!downsampled && !result.truncated) return '';
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
    // request is in flight — paging, sorting, and filtering read as a live
    // table adjusting, not a flash back to a loading skeleton every click.
    placeholderData: keepPreviousData,
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
    };
  }
  return {
    rows: queried,
    loading: query.isPending,
    error: '',
    note: query.data ? describeResult(query.data) : '',
    matchedRows: query.data ? (query.data.matchedRows ?? query.data.totalRows) : undefined,
    returnedRows: query.data?.returnedRows,
  };
}
