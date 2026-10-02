import type {
  Column,
  ColumnDef,
  PaginationState,
  Row,
  SortingState,
  Updater,
} from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import { Table2Icon } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Badge as ReUIBadge } from '@/components/reui/badge';
import { DataGridColumnHeader } from '@/components/reui/data-grid/data-grid-column-header';
import { DataGridPagination } from '@/components/reui/data-grid/data-grid-pagination';
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
  type DataGridFeatures,
} from '@/components/reui/data-grid/data-grid';
import { DATA_GRID_PAGE_SIZES } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import {
  ClioRangeColumnFilter,
  ClioTextColumnFilter,
  type ClioColumnFilterValue,
} from './data-table-column-filter';
import { ClioDataGridTable } from './data-grid-table';

export type ClioDataColumn = string | { key: string; label: string };
export type ClioDataRow = Record<string, unknown>;

/**
 * Stable column-header renderer, declared once at module scope instead of as
 * an inline arrow function inside the `columns` map below.
 *
 * `flexRender` instantiates `column.columnDef.header` BY REFERENCE
 * (`React.createElement(Comp, props)`), and TanStack v9 rebuilds its table
 * and column wrapper objects on every render (the reui data-grid's own
 * comment: v9, unlike v8, "re-creates [table] on every state change"). An
 * inline arrow function recreated on every `columns` recompute — any filter
 * keystroke, any unrelated re-render upstream in the A2UI/ARC/query-client
 * stack — gets a fresh identity each time, which React treats as a
 * different component TYPE at that slot: it discards the previous instance
 * rather than re-rendering it, wiping out whatever local state it held (the
 * header's DropdownMenu open/closed state). That was the actual cause of the
 * "the filter/sort dropdown won't stay open" behavior (#1533 follow-up) —
 * the dropdown was never being toggled closed, its whole component instance
 * was being unmounted and replaced with a fresh, default-closed one.
 *
 * The fix: a permanently stable function reference for `header`/`cell`,
 * fed the per-column data it needs through `columnDef.meta` (read fresh
 * every render) instead of through a JS closure. Column-def churn is then
 * an ordinary props update — which preserves component state — never a
 * remount.
 */
function ClioColumnHeaderCell<TData extends object>({
  column,
}: {
  column: Column<DataGridFeatures, TData, unknown>;
}) {
  const meta = column.columnDef.meta;
  return (
    <DataGridColumnHeader column={column} filter={meta?.headerFilter} title={meta?.headerTitle} />
  );
}

/** Stable cell renderer for `ClioDataTable` — see `ClioColumnHeaderCell` above for why this must not be an inline closure. */
function ClioColumnValueCell<TData extends ClioDataRow>({
  column,
  row,
}: {
  column: Column<DataGridFeatures, TData, unknown>;
  row: Row<DataGridFeatures, TData>;
}) {
  const value = (row.original as ClioDataRow)[column.id];
  return (
    // One line per row: a wrapped cell makes every row several lines tall, and a
    // page of them pushes the rest of the conversation far out of view. The full
    // value stays reachable in the tooltip and by widening the column.
    <span
      className={cn('block truncate text-xs', typeof value === 'number' && 'tabular-nums')}
      title={exactCell(value)}
    >
      {formatCell(value)}
    </span>
  );
}

/**
 * Server-driven paging, sorting, and per-column filtering for a `dataUri`
 * table: the current page is exactly what `rows` holds, `totalRows` is the
 * whole dataset's matched count (not this page's length), and every control
 * below issues a fresh bounded query rather than slicing what is already on
 * screen — no row is ever unreachable behind a client-side cap.
 */
export interface ClioDataTableServerControl {
  pageIndex: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  /** Rows the current query matches, across the whole dataset (not just this page). */
  totalRows: number;
  /** Fires once per pagination change, page index and size together (a size change resets to page 0). */
  onPaginationChange: (pagination: { pageIndex: number; pageSize: number }) => void;
  /** The one active sort key, in the wire's own `{column, desc}` shape — never `direction`. */
  sort?: { column: string; desc: boolean };
  onSortChange: (sort: { column: string; desc: boolean } | undefined) => void;
  /** This viewer's own per-column filters — layered on the producer's `dataQuery.filter`, never replacing it. */
  filters: ReadonlyMap<string, ClioColumnFilterValue>;
  onFilterChange: (column: string, value: ClioColumnFilterValue | undefined) => void;
  /** Which filter control a column gets; `undefined` disables filtering for it. */
  columnKind: (key: string) => 'number' | 'text' | undefined;
}

/** Interactive, resizable data table shared by native resources and A2UI surfaces. */
export function ClioDataTable({
  columns: columnDefinitions,
  rows,
  label = 'Data table',
  description,
  onRowClick,
  selectedRows,
  server,
  toolbarExtra,
}: {
  columns: readonly ClioDataColumn[];
  rows: readonly ClioDataRow[];
  label?: string;
  description?: string;
  onRowClick?: (row: ClioDataRow, interaction: { index: number; shiftKey: boolean }) => void;
  /** Indexes (into `rows`) to highlight as selected. */
  selectedRows?: ReadonlySet<number>;
  /** Present for a `dataUri` table: pages, sorts, and filters over the whole dataset server-side. */
  server?: ClioDataTableServerControl;
  /** A `dataUri` table's own "Reference this" trigger, slotted into the toolbar. */
  toolbarExtra?: ReactNode;
}) {
  const columns = useMemo<ColumnDef<DataGridFeatures, ClioDataRow, unknown>[]>(
    () =>
      columnDefinitions.map((definition) => {
        const key = typeof definition === 'string' ? definition : definition.key;
        const title =
          typeof definition === 'string' ? definition.replaceAll('_', ' ') : definition.label;
        const kind = server?.columnKind(key);
        const filterValue = server?.filters.get(key);
        const filterNode =
          kind === 'text' ? (
            <ClioTextColumnFilter
              columnLabel={title}
              onChange={(contains) =>
                server!.onFilterChange(key, contains ? { kind: 'text', contains } : undefined)
              }
              value={filterValue?.kind === 'text' ? filterValue.contains : ''}
            />
          ) : kind === 'number' ? (
            <ClioRangeColumnFilter
              columnLabel={title}
              onChange={({ min, max }) =>
                server!.onFilterChange(
                  key,
                  min !== undefined || max !== undefined ? { kind: 'range', min, max } : undefined,
                )
              }
              value={
                filterValue?.kind === 'range' ? { max: filterValue.max, min: filterValue.min } : {}
              }
            />
          ) : undefined;
        return {
          id: key,
          accessorFn: (row: ClioDataRow) => row[key],
          enableSorting: Boolean(server),
          header: ClioColumnHeaderCell,
          cell: ClioColumnValueCell,
          meta: { autoSize: true, headerFilter: filterNode, headerTitle: title },
        };
      }),
    [columnDefinitions, server],
  );
  const data = useMemo(() => [...rows], [rows]);
  const rowSelection = useMemo(
    () =>
      Object.fromEntries([...(selectedRows ?? [])].map((index) => [String(index), true as const])),
    [selectedRows],
  );

  const pagination = useMemo<PaginationState | undefined>(
    () => (server ? { pageIndex: server.pageIndex, pageSize: server.pageSize } : undefined),
    [server],
  );
  const sorting = useMemo<SortingState>(
    () => (server?.sort ? [{ desc: server.sort.desc, id: server.sort.column }] : []),
    [server],
  );

  const table = useTable({
    columns,
    data,
    features: dataGridFeatures,
    ...(server
      ? {
          manualFiltering: true,
          manualPagination: true,
          manualSorting: true,
          onPaginationChange: (updater: Updater<PaginationState>) => {
            const current = pagination!;
            const next = typeof updater === 'function' ? updater(current) : updater;
            if (next.pageIndex !== current.pageIndex || next.pageSize !== current.pageSize) {
              server.onPaginationChange(next);
            }
          },
          onSortingChange: (updater: Updater<SortingState>) => {
            const next = typeof updater === 'function' ? updater(sorting) : updater;
            const first = next[0];
            server.onSortChange(first ? { column: first.id, desc: first.desc } : undefined);
          },
          pageCount: Math.max(1, Math.ceil(server.totalRows / server.pageSize)),
          state: {
            pagination,
            rowSelection,
            sorting,
          },
        }
      : selectedRows
        ? { state: { rowSelection } }
        : {}),
    // Row ids are the row's index in `rows` (TanStack's default), matching `selectedRows`.
  });

  return (
    <DataGrid<DataGridFeatures, ClioDataRow>
      emptyMessage="No rows were provided for this data view."
      onRowClick={onRowClick}
      recordCount={server ? server.totalRows : rows.length}
      table={table}
      tableLayout={{ columnsResizable: true, dense: true, headerSticky: true, width: 'fixed' }}
    >
      <DataGridContainer className="overflow-hidden rounded-xl border">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b bg-muted/40 px-3 py-2">
          <Table2Icon aria-hidden="true" className="size-3.5 text-primary" />
          <ReUIBadge radius="full" variant="primary-light">
            {label}, {(server ? server.totalRows : rows.length).toLocaleString()} rows
          </ReUIBadge>
          {toolbarExtra ? <div className="ms-auto flex items-center gap-1.5">{toolbarExtra}</div> : null}
        </div>
        <div
          aria-description={description}
          aria-label={`${label} columns`}
          className="max-w-full overflow-x-auto overscroll-x-contain"
          role="region"
          tabIndex={0}
        >
          <ClioDataGridTable />
        </div>
        {server || rows.length > 10 ? (
          <div className="border-t px-3">
            <DataGridPagination sizes={[...(server?.pageSizeOptions ?? DATA_GRID_PAGE_SIZES)]} />
          </div>
        ) : null}
      </DataGridContainer>
    </DataGrid>
  );
}

function formatCell(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'Unavailable';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 9 }).format(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function exactCell(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
