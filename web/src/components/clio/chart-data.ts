import { TransportError, type ArtifactTableQueryResult } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { IMMUTABLE_QUERY, TABLE_QUERY_ROW_LIMIT } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { isJsonObject } from './chart-spec-guard';

/**
 * Rows for `clio.chart.v1`: inline `data`, or a `dataUri` artifact read
 * through `POST /v1/artifacts/{id}/table-query` — the only request a chart
 * makes (its Vega loader refuses every URL and file).
 */

export type ChartCell = string | number | boolean | null;
export type ChartRow = Record<string, ChartCell>;

/** `$defs/ChartDataQuery`, as the producer wrote it. */
export interface ChartDataQuery {
  columns?: string[];
  filter?: Record<string, unknown>[];
  aggregate?: Record<string, unknown>;
  downsample?: Record<string, unknown>;
  limit?: number;
}

export interface ChartRows {
  rows: ChartRow[] | undefined;
  loading: boolean;
  error: string;
  /** Says when the server returned fewer rows than matched (truncated or downsampled). */
  note: string;
}

export function artifactIdFromDataUri(uri: string | undefined): string | undefined {
  return uri ? /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(uri)?.[1] : undefined;
}

/** Columnar `{name: values[]}` to row objects (`count` rows). */
export function columnarToRows(
  columns: Readonly<Record<string, readonly ChartCell[]>>,
  count: number,
): ChartRow[] {
  const names = Object.keys(columns);
  const rows: ChartRow[] = new Array(count);
  for (let index = 0; index < count; index += 1) {
    const row: ChartRow = {};
    for (const name of names) row[name] = columns[name]![index] ?? null;
    rows[index] = row;
  }
  return rows;
}

/**
 * Source columns a hand-written spec reads: every string `field` in it, minus
 * the names its own transforms create (`as`). A producer that aggregates or
 * computes in ways this cannot see should name `dataQuery.columns`.
 */
export function specFieldNames(spec: unknown): string[] {
  const fields = new Set<string>();
  const derived = new Set<string>();
  const stack: unknown[] = [spec];
  while (stack.length) {
    const node = stack.pop();
    if (Array.isArray(node)) {
      for (let index = node.length - 1; index >= 0; index -= 1) stack.push(node[index]);
      continue;
    }
    if (!isJsonObject(node)) continue;
    const children: unknown[] = [];
    for (const [key, value] of Object.entries(node)) {
      if (key === 'field' && typeof value === 'string') fields.add(value);
      else if (key === 'as' && typeof value === 'string') derived.add(value);
      else if (key === 'as' && Array.isArray(value)) {
        for (const name of value) if (typeof name === 'string') derived.add(name);
      } else children.push(value);
    }
    // Document order, so the requested columns read like the spec.
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return [...fields].filter((name) => !derived.has(name));
}

/**
 * The projection to request: the producer's `columns`, else the named fields
 * (preset fill fields and the selection field, in that order) and then any
 * other field the spec reads.
 */
export function chartQueryColumns(
  queryColumns: readonly string[] | undefined,
  spec: unknown,
  namedFields: readonly (string | undefined)[],
): string[] {
  if (queryColumns?.length) return [...queryColumns];
  const names = new Set<string>();
  for (const name of namedFields) if (name) names.add(name);
  for (const name of specFieldNames(spec)) names.add(name);
  return [...names];
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
export function useChartRows({
  columns,
  data,
  dataQuery,
  dataUri,
}: {
  columns: readonly string[];
  data: ChartRow[] | undefined;
  dataQuery: ChartDataQuery | undefined;
  dataUri: string | undefined;
}): ChartRows {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = artifactIdFromDataUri(dataUri);
  const limit = Math.min(dataQuery?.limit ?? TABLE_QUERY_ROW_LIMIT, TABLE_QUERY_ROW_LIMIT);
  const request = useMemo(
    () => ({
      columns,
      ...(dataQuery?.filter ? { filter: dataQuery.filter } : {}),
      ...(dataQuery?.aggregate ? { aggregate: dataQuery.aggregate } : {}),
      ...(dataQuery?.downsample ? { downsample: dataQuery.downsample } : {}),
      limit,
    }),
    [columns, dataQuery, limit],
  );
  const query = useQuery({
    enabled: !data && Boolean(artifactId) && columns.length > 0,
    queryKey: queryKeys.key(
      'artifact-table-query',
      settings.endpoint,
      artifactId,
      JSON.stringify(request),
    ),
    queryFn: ({ signal }) => repository.artifactTableQuery(artifactId!, request, signal),
    retry: retryTableQuery,
    ...IMMUTABLE_QUERY,
  });
  const queried = useMemo(
    () =>
      query.data
        ? columnarToRows(query.data.columns as Record<string, ChartCell[]>, query.data.returnedRows)
        : undefined,
    [query.data],
  );

  if (data) return { rows: data, loading: false, error: '', note: '' };
  if (!artifactId) {
    return {
      rows: undefined,
      loading: false,
      error: 'the data source is not a registered artifact id.',
      note: '',
    };
  }
  if (!columns.length) {
    return {
      rows: undefined,
      loading: false,
      error: 'no columns to read; name them in dataQuery.columns.',
      note: '',
    };
  }
  if (query.isError) {
    return {
      rows: undefined,
      loading: false,
      error: tableQueryErrorMessage(query.error),
      note: '',
    };
  }
  return {
    rows: queried,
    loading: query.isPending,
    error: '',
    note: query.data ? describeResult(query.data) : '',
  };
}
