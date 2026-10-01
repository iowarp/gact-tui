import type { QueryColumnSchema, QueryRow, TableDataQuery } from './table-query-rows';
import type { ClioColumnFilterValue } from './data-table-column-filter';

/**
 * The viewer's own server-side filter, shared by every `dataUri` component
 * (`clio.data-table.v1`, `clio.chart.v1`, `clio.map.v1`): the same per-column
 * filter controls (text "contains", numeric range), always layered onto —
 * never replacing — the producer's own `dataQuery.filter` (owner ruling,
 * #1533: "Tables page server-side with a page-size selector, per-column
 * filters and click-to-sort, all layered on top of the agent's own
 * dataQuery" — charts and maps get the same controls). One implementation so
 * the merge semantics (and its tests) cannot drift between components.
 */

/** A column's sampled kind, from the first non-null value the current page/rows hold — a fallback for when no server `schema` is available (inline rows/points, never a `dataUri` query). */
export function columnKindFromRows(rows: readonly QueryRow[] | undefined, key: string): 'number' | 'text' {
  const sample = rows?.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
  return typeof sample === 'number' ? 'number' : 'text';
}

const NUMERIC_TYPE_PREFIXES = ['int', 'uint', 'float', 'double', 'decimal', 'halffloat'];
const TEXT_TYPES = new Set(['string', 'large_string', 'utf8', 'large_utf8']);

/**
 * A column's filter kind from the server's own Arrow-derived `schema` (e.g.
 * `int64`, `double`, `string`, `bool`, `timestamp[us]`) — authoritative over
 * sampling a page (`columnKindFromRows`), which flips kind whenever the
 * FIRST non-null value on the current page happens to look like a number
 * (e.g. a numeric-looking id) or whenever a page samples all-nulls.
 * `undefined` for a type this table has no filter control for (boolean,
 * temporal, binary, list, struct, null): never guessed as text, since a
 * `contains` filter sent for one of those is never valid.
 */
export function columnKindFromSchema(
  schema: readonly QueryColumnSchema[] | undefined,
  key: string,
): 'number' | 'text' | undefined {
  const type = schema?.find((column) => column.name === key)?.type;
  if (!type) return undefined;
  if (TEXT_TYPES.has(type)) return 'text';
  if (NUMERIC_TYPE_PREFIXES.some((prefix) => type.startsWith(prefix))) return 'number';
  return undefined;
}

/** The viewer's own column filters, layered onto (never replacing) the producer's `dataQuery.filter`. */
export function mergeFilters(
  base: TableDataQuery['filter'],
  userFilters: ReadonlyMap<string, ClioColumnFilterValue>,
): NonNullable<TableDataQuery['filter']> {
  const merged = [...(base ?? [])];
  for (const [column, value] of userFilters) {
    if (value.kind === 'text' && value.contains) {
      merged.push({ column, op: 'contains', value: value.contains });
    } else if (value.kind === 'range' && (value.min !== undefined || value.max !== undefined)) {
      merged.push({ column, op: 'range', value: [value.min ?? null, value.max ?? null] });
    }
  }
  return merged;
}

/**
 * The viewer's own column filters applied CLIENT-SIDE, for INLINE rows (no
 * `dataUri`, so there is no server to filter through) — G0: "Full screen,
 * Reference this and Filters on inline-data views too: inline rows filter
 * client-side, dataUri views on the server." Mirrors the server's own
 * `contains` (case-insensitive substring) and `range` (inclusive both ends)
 * semantics (`table_query.py::_filter_mask`), so the two codepaths read the
 * same way to the viewer regardless of which one ran.
 */
export function applyClientFilters<T extends QueryRow>(
  rows: readonly T[],
  userFilters: ReadonlyMap<string, ClioColumnFilterValue>,
): T[] {
  if (!userFilters.size) return [...rows];
  return rows.filter((row) =>
    [...userFilters.entries()].every(([column, value]) => {
      const cell = row[column];
      if (value.kind === 'text') {
        if (!value.contains) return true;
        return typeof cell === 'string' && cell.toLowerCase().includes(value.contains.toLowerCase());
      }
      const numeric = typeof cell === 'number' ? cell : Number(cell);
      if (!Number.isFinite(numeric)) return false;
      if (value.min !== undefined && numeric < value.min) return false;
      if (value.max !== undefined && numeric > value.max) return false;
      return true;
    }),
  );
}

/** A short, reader-facing description of one merged filter entry, for a zone reference's "active filters" line. */
export function describeQueryFilter(filter: NonNullable<TableDataQuery['filter']>[number]): string {
  switch (filter.op) {
    case 'range': {
      const [min, max] = (filter.value as [unknown, unknown] | undefined) ?? [null, null];
      if (min !== null && max !== null) return `${filter.column} from ${String(min)} to ${String(max)}`;
      if (min !== null) return `${filter.column} ≥ ${String(min)}`;
      if (max !== null) return `${filter.column} ≤ ${String(max)}`;
      return `${filter.column} in range`;
    }
    case 'contains':
      return `${filter.column} contains “${String(filter.value)}”`;
    case 'eq':
      return `${filter.column} = ${String(filter.value)}`;
    case 'in':
      return `${filter.column} in [${(filter.value as unknown[]).join(', ')}]`;
    case 'isnull':
      return filter.value === false ? `${filter.column} is not empty` : `${filter.column} is empty`;
  }
}
