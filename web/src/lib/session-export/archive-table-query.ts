import type {
  ArtifactTableQueryRequest,
  ArtifactTableQueryResult,
  TableQueryScalar,
} from '@clio/core/v3';
import { compareCells, downsampleArchiveRows } from './archive-table-downsample';

type Cell = unknown;
type Row = Record<string, Cell>;

/** Match the server's Arrow scalar cast, including string-valued choice controls. */
function scalarFor(value: unknown, type: string): unknown {
  if (value == null) return value;
  if (/^(u?int\d+|float\d+|double|decimal)/u.test(type)) {
    if (typeof value === 'number') return value;
    if (typeof value === 'boolean') return Number(value);
    if (typeof value === 'string' && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/iu.test(value)) {
      const number = Number(value);
      if (Number.isFinite(number) && (!/^u?int/u.test(type) || Number.isInteger(number)))
        return number;
    }
    throw new Error(`This filter value cannot be cast to ${type}.`);
  }
  if (/^(large_)?string$/u.test(type)) return String(value);
  if (type === 'bool') {
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1' || value === 1) return true;
    if (value === 'false' || value === '0' || value === 0) return false;
    throw new Error('This filter value cannot be cast to bool.');
  }
  if (/^(timestamp|date)/u.test(type) && typeof value === 'string') {
    const instant = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/u.test(value) ? value : `${value}Z`);
    if (Number.isFinite(instant)) return instant;
    throw new Error(`This filter value cannot be cast to ${type}.`);
  }
  return value;
}

function predicate(
  row: Row,
  filter: NonNullable<ArtifactTableQueryRequest['filter']>[number],
  type: string,
): boolean {
  const cell = /^(timestamp|date)/u.test(type)
    ? scalarFor(row[filter.column], type)
    : row[filter.column];
  switch (filter.op) {
    case 'eq':
      return cell === filter.value;
    case 'in':
      return filter.value.includes(cell as TableQueryScalar);
    case 'contains':
      return typeof cell === 'string' && cell.toLowerCase().includes(filter.value.toLowerCase());
    case 'isnull':
      return filter.value === false ? cell != null : cell == null;
    case 'range': {
      if (cell == null) return false;
      const [min, max] = filter.value;
      const value = cell as string | number;
      return (min == null || value >= min) && (max == null || value <= max);
    }
  }
}

/** Query archived source rows locally; no request is made to the original server. */
export function queryArchiveTable(
  source: ArtifactTableQueryResult,
  query: ArtifactTableQueryRequest,
): ArtifactTableQueryResult {
  let rows: Row[] = Array.from({ length: source.returnedRows }, (_, i) =>
    Object.fromEntries(
      Object.entries(source.columns).map(([column, values]) => [column, values[i]]),
    ),
  );
  const keys = new Map(rows.map((row, i) => [row, source.rowKey?.values[i]]));
  const filters = (query.filter ?? []).map((filter) => {
    const field = source.schema.find((column) => column.name === filter.column);
    if (!field) throw new Error(`Unknown archived table column: ${filter.column}`);
    const value =
      filter.op === 'in' || filter.op === 'range'
        ? filter.value.map((item) => scalarFor(item, field.type))
        : filter.op === 'eq'
          ? scalarFor(filter.value, field.type)
          : filter.value;
    return { filter: { ...filter, value } as typeof filter, type: field.type };
  });
  rows = rows.filter((row) => filters.every(({ filter, type }) => predicate(row, filter, type)));
  if (query.aggregate) {
    const groups = new Map<string, Row[]>();
    const keys = query.aggregate.groupBy ?? [];
    rows.forEach((row) => {
      const key = JSON.stringify(keys.map((field) => row[field]));
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    });
    rows = [...groups.values()].map((group) => {
      const row: Row = Object.fromEntries(keys.map((key) => [key, group[0][key]]));
      query.aggregate!.metrics.forEach(({ column, fn }) => {
        const values = group
          .map((item) => item[column])
          .filter((value): value is number => typeof value === 'number');
        const sorted = [...values].sort((a, b) => a - b);
        row[`${column}_${fn}`] =
          fn === 'count'
            ? group.filter((item) => item[column] != null).length
            : !values.length
              ? null
              : fn === 'sum'
                ? values.reduce((a, b) => a + b, 0)
                : fn === 'mean'
                  ? values.reduce((a, b) => a + b, 0) / values.length
                  : fn === 'min'
                    ? sorted[0]
                    : fn === 'max'
                      ? sorted.at(-1)
                      : (sorted[Math.floor((sorted.length - 1) / 2)] +
                          sorted[Math.floor(sorted.length / 2)]) /
                        2;
      });
      return row;
    });
  }
  const matchedRows = rows.length;
  const sampled = downsampleArchiveRows(rows, query);
  rows = sampled.rows;
  for (const sort of [...(query.sort ?? [])].reverse())
    rows.sort((a, b) => {
      return compareCells(a[sort.column], b[sort.column], sort.desc);
    });
  const truncated = rows.length - (query.offset ?? 0) > query.limit;
  rows = rows.slice(query.offset ?? 0, (query.offset ?? 0) + query.limit);
  const names = query.columns?.length ? [...query.columns] : Object.keys(rows[0] ?? source.columns);
  return {
    ...source,
    schema: names.map(
      (name) => source.schema.find((column) => column.name === name) ?? { name, type: 'float64' },
    ),
    columns: Object.fromEntries(
      names.map((name) => [name, rows.map((row) => row[name] ?? null)]),
    ) as ArtifactTableQueryResult['columns'],
    totalRows: source.totalRows,
    matchedRows,
    returnedRows: rows.length,
    truncated,
    offset: query.offset ?? 0,
    downsample: sampled.info,
    rowKey:
      source.rowKey && !query.aggregate
        ? { column: source.rowKey.column, values: rows.map((row) => keys.get(row)!) }
        : undefined,
  };
}
