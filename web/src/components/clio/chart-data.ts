import { isJsonObject } from './chart-spec-guard';
import {
  artifactIdFromDataUri,
  columnarToRows,
  tableQueryErrorMessage,
  useTableQueryRows,
  type QueryCell,
  type QueryRow,
  type TableDataQuery,
  type TableQueryRows,
} from './table-query-rows';

/**
 * `clio.chart.v1`-specific row helpers. The table-query client itself
 * (`useChartRows` below) is the shared `useTableQueryRows` hook in
 * `table-query-rows.ts` — the same client `clio.map.v1` and
 * `clio.data-table.v1` use for their own `dataUri` reads.
 */

export type ChartCell = QueryCell;
export type ChartRow = QueryRow;
export type ChartDataQuery = TableDataQuery;
export type ChartRows = TableQueryRows;

export { artifactIdFromDataUri, columnarToRows, tableQueryErrorMessage };

/** Inline rows as given, or one bounded table query for an artifact. */
export function useChartRows(args: {
  columns: readonly string[];
  data: ChartRow[] | undefined;
  dataQuery: ChartDataQuery | undefined;
  dataUri: string | undefined;
}): ChartRows {
  return useTableQueryRows(args);
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
