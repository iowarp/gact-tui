import type {
  Column,
  ColumnDef,
  PaginationState,
  Row,
  SortingState,
  Updater,
} from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
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
import { DataFilterPopover, type DataFilterField } from './data-filter-popover';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import { SurfaceToolbar, type SurfaceCapabilities } from './surface-toolbar';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';

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
      {formatCell(value, column.id)}
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
  /** Optional server-backed view of the exact rows selected across pages. */
  selectedOnly?: boolean;
  selectedCount?: number;
  onSelectedOnlyChange?: (selectedOnly: boolean) => void;
}

/**
 * Interactive, resizable data table shared by native resources and A2UI
 * surfaces.
 *
 * Owns the G0 full-screen affordance itself (view-local UI state, not data a
 * caller needs to see) — `capabilities` carries only what depends on the
 * caller's own data/query (download, "Reference this"); `ClioDataTable`
 * merges its own `fullScreen` entry in before handing the result to
 * `SurfaceToolbar`, the same shared framework `clio.chart.v1` renders from.
 */
export function ClioDataTable({
  columns: columnDefinitions,
  rows,
  label = 'Data table',
  description,
  onRowClick,
  selectedRows,
  externalSelection = false,
  selectedOnly = false,
  selectedCount = 0,
  onSelectedOnlyChange,
  server,
  inlineFilters,
  onInlineFilterChange,
  inlineSort,
  onInlineSortChange,
  capabilities,
}: {
  columns: readonly ClioDataColumn[];
  rows: readonly ClioDataRow[];
  label?: string;
  description?: string;
  onRowClick?: (row: ClioDataRow, interaction: { index: number; shiftKey: boolean }) => void;
  /** Indexes (into `rows`) to highlight as selected. */
  selectedRows?: ReadonlySet<number>;
  /** Marks rows selected from a sibling view with a stronger visual cue. */
  externalSelection?: boolean;
  selectedOnly?: boolean;
  selectedCount?: number;
  onSelectedOnlyChange?: (selectedOnly: boolean) => void;
  /** Present for a `dataUri` table: pages, sorts, and filters over the whole dataset server-side. */
  server?: ClioDataTableServerControl;
  inlineFilters?: ReadonlyMap<string, ClioColumnFilterValue>;
  onInlineFilterChange?: (column: string, value: ClioColumnFilterValue | undefined) => void;
  inlineSort?: { column: string; desc: boolean };
  onInlineSortChange?: (sort: { column: string; desc: boolean } | undefined) => void;
  /** Download / "Reference this" affordances the caller declares; full screen is always added here. */
  capabilities?: SurfaceCapabilities;
}) {
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterFields = useMemo<DataFilterField[]>(
    () =>
      columnDefinitions.map((definition) => {
        const key = typeof definition === 'string' ? definition : definition.key;
        const label =
          typeof definition === 'string' ? definition.replaceAll('_', ' ') : definition.label;
        const sample = rows.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
        return {
          key,
          label,
          kind: server?.columnKind(key) ?? (typeof sample === 'number' ? 'number' : 'text'),
        };
      }),
    [columnDefinitions, rows, server],
  );
  const columns = useMemo<ColumnDef<DataGridFeatures, ClioDataRow, unknown>[]>(
    () =>
      columnDefinitions.map((definition) => {
        const key = typeof definition === 'string' ? definition : definition.key;
        const title =
          typeof definition === 'string' ? definition.replaceAll('_', ' ') : definition.label;
        const kind =
          server?.columnKind(key) ??
          (onInlineFilterChange
            ? typeof rows.find((row) => row[key] !== null && row[key] !== undefined)?.[key] ===
              'number'
              ? 'number'
              : 'text'
            : undefined);
        const sample = rows.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
        const isTime = typeof sample === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:/u.test(sample);
        const size = isTime
          ? 220
          : /(?:^|_)(?:id|year)(?:$|_)/iu.test(key)
            ? 108
            : typeof sample === 'number'
              ? 104
              : 160;
        const filterValue = server?.filters.get(key) ?? inlineFilters?.get(key);
        const filterNode =
          kind === 'text' ? (
            <ClioTextColumnFilter
              columnLabel={title}
              onChange={(contains) =>
                (server?.onFilterChange ?? onInlineFilterChange)?.(
                  key,
                  contains ? { kind: 'text', contains } : undefined,
                )
              }
              value={filterValue?.kind === 'text' ? filterValue.contains : ''}
            />
          ) : kind === 'number' ? (
            <ClioRangeColumnFilter
              columnLabel={title}
              onChange={({ min, max }) =>
                (server?.onFilterChange ?? onInlineFilterChange)?.(
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
          enableSorting: true,
          size,
          minSize: isTime ? 190 : 80,
          header: ClioColumnHeaderCell,
          cell: ClioColumnValueCell,
          meta: { autoSize: true, headerFilter: filterNode, headerTitle: title },
        };
      }),
    [columnDefinitions, inlineFilters, onInlineFilterChange, rows, server],
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
  const sorting = useMemo<SortingState>(() => {
    const sort = server?.sort ?? inlineSort;
    return sort ? [{ desc: sort.desc, id: sort.column }] : [];
  }, [inlineSort, server]);

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
      : onInlineSortChange
        ? {
            manualSorting: true,
            onSortingChange: (updater: Updater<SortingState>) => {
              const next = typeof updater === 'function' ? updater(sorting) : updater;
              const first = next[0];
              onInlineSortChange(first ? { column: first.id, desc: first.desc } : undefined);
            },
            state: { rowSelection, sorting },
          }
        : selectedRows
          ? { state: { rowSelection } }
          : {}),
    // Row ids are the row's index in `rows` (TanStack's default), matching `selectedRows`.
  });

  const toolbarCapabilities: SurfaceCapabilities = {
    ...capabilities,
    filters:
      (server || onInlineFilterChange) && filterFields.length
        ? {
            content: (
              <DataFilterPopover
                fields={filterFields}
                filters={server?.filters ?? inlineFilters ?? new Map()}
                onFilterChange={server?.onFilterChange ?? onInlineFilterChange!}
                onOpenChange={setFiltersOpen}
              />
            ),
            isOpen: filtersOpen,
          }
        : undefined,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    overflowContent: (
      <DropdownMenuItem
        className="text-xs text-muted-foreground"
        disabled
        onSelect={(event) => event.preventDefault()}
      >
        {`${(server ? server.totalRows : rows.length).toLocaleString()} rows`}
      </DropdownMenuItem>
    ),
  };
  const selectedOnlyAction =
    (selectedCount > 0 || selectedOnly) && onSelectedOnlyChange ? (
      <button
        aria-pressed={selectedOnly}
        className={cn(
          'shrink-0 rounded-md px-2 py-1 text-xs transition-colors hover:bg-muted',
          selectedOnly ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
        )}
        onClick={() => onSelectedOnlyChange(!selectedOnly)}
        type="button"
      >
        {selectedOnly ? 'Show all' : `Show selected (${selectedCount.toLocaleString()})`}
      </button>
    ) : null;

  return (
    <DataGrid<DataGridFeatures, ClioDataRow>
      emptyMessage={
        selectedOnly
          ? 'No selected rows match the current view.'
          : server?.filters.size || inlineFilters?.size
            ? 'No rows match the current filters.'
            : 'No rows were provided for this data view.'
      }
      onRowClick={onRowClick}
      recordCount={server ? server.totalRows : rows.length}
      table={table}
      tableLayout={{ columnsResizable: true, dense: true, headerSticky: true, width: 'fixed' }}
    >
      <DataGridContainer
        className={cn(
          'group relative overflow-hidden rounded-xl border',
          externalSelection &&
            '[&_tr[aria-selected=true]]:bg-primary/20 [&_tr[aria-selected=true]]:shadow-[inset_3px_0_0_var(--primary)]',
        )}
      >
        <div className="flex min-w-0 items-start gap-3 px-3 py-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={label}>
            {label}
          </h3>
          {selectedOnlyAction}
          <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
        </div>
        {/* Only the scrollable rows + pagination move into the full-screen
            dialog (same convention as `clio.chart.v1`'s `FramePanel`): the
            header above, with the toolbar's own full-screen toggle, stays put. */}
        <SurfaceFullScreenHost
          fullscreen={fullscreen}
          headerExtra={
            <div className="flex items-center gap-2">
              {selectedOnlyAction}
              <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
            </div>
          }
          onOpenChange={setFullscreen}
          title={label}
        >
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
        </SurfaceFullScreenHost>
      </DataGridContainer>
    </DataGrid>
  );
}

function formatCell(value: unknown, key: string): string {
  if (value === undefined || value === null || value === '') return 'Unavailable';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (/(?:^|_)(?:id|year)(?:$|_)/iu.test(key) && Number.isInteger(value)) return String(value);
    // CSV readers can expose binary float noise (for example -0.360000014
    // for a depth reported as -0.36). Keep the exact value in the cell title,
    // but display the short decimal when it is numerically indistinguishable.
    for (let digits = 0; digits <= 4; digits += 1) {
      const rounded = Number(value.toFixed(digits));
      if (Math.abs(value - rounded) <= Math.max(1e-7, Math.abs(value) * 1e-7)) {
        return new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(rounded);
      }
    }
    return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 9 }).format(value);
  }
  if (typeof value === 'string') {
    const timestamp = /^(\d{4}-\d\d-\d\d)T(\d\d:\d\d:\d\d)(?:\.\d+)?(Z|[+-]\d\d:\d\d)$/u.exec(
      value,
    );
    if (timestamp) {
      const zone =
        timestamp[3] === 'Z' || timestamp[3] === '+00:00' || timestamp[3] === '-00:00'
          ? 'UTC'
          : `UTC${timestamp[3]}`;
      return `${timestamp[1]} ${timestamp[2]} ${zone}`;
    }
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function exactCell(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}
