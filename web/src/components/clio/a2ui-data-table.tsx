import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { Table2Icon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Skeleton } from '@/components/ui/skeleton';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { refinedStrictObject } from './a2ui-refined-schema';
import type { ClioColumnFilterValue } from './data-table-column-filter';
import {
  ClioDataTable,
  type ClioDataColumn,
  type ClioDataRow,
  type ClioDataTableServerControl,
} from './data-table';
import { dataQuerySchema, fieldNameSchema } from './data-query-schema';
import {
  isBoundToPath,
  isSelectionValue,
  parseSelectionState,
  selectionIncludes,
  type SelectionWriter,
} from './selection-state';
import { type QueryRow, type TableDataQuery, useTableQueryRows } from './table-query-rows';

/** Page sizes offered for a `dataUri` table, paging through the whole dataset server-side. */
const DATA_TABLE_PAGE_SIZES = [25, 50, 100, 500] as const;
const DEFAULT_DATA_TABLE_PAGE_SIZE = 50;

function columnKey(column: ClioDataColumn): string {
  return typeof column === 'string' ? column : column.key;
}

export interface ClioSelectableDataTableProps {
  accessibility?: A2UIAccessibility;
  columns: ClioDataColumn[];
  rows: ClioDataRow[];
  componentId: string;
  /** The resolved `selection` value; a `SelectionState` when it is bound to `/selection/<key>`. */
  selection?: unknown;
  /** Present only when `selection` is bound to a data-model path. */
  setSelection?: SelectionWriter;
  /**
   * The column a bound `selection` reads and writes. Required by the schema
   * whenever `selection` is bound; when absent (unbound, or a direct caller
   * that predates the field), falls back to the bound field when it is one of
   * the table's columns, else the first column.
   */
  selectionField?: string;
  action?: () => void;
  /** Present for a `dataUri` table: pages, sorts, and filters over the whole dataset server-side. */
  server?: ClioDataTableServerControl;
}

/**
 * `clio.data-table.v1` with a linked selection: rows whose value of the
 * `selectionField` column is named by a bound selection are highlighted, and
 * clicking a row selects its `selectionField` value — for every component
 * bound to the same path (a map or chart naming the same column).
 */
export function ClioSelectableDataTable({
  accessibility,
  action,
  columns,
  componentId,
  rows,
  selection,
  selectionField,
  server,
  setSelection,
}: ClioSelectableDataTableProps) {
  const state = useMemo(() => parseSelectionState(selection), [selection]);
  const keys = useMemo(() => columns.map(columnKey), [columns]);
  const keyColumn =
    selectionField ?? (state && keys.includes(state.field) ? state.field : keys[0]);
  const selectedRows = useMemo(() => {
    if (!state || keyColumn === undefined) return undefined;
    const selected = new Set<number>();
    rows.forEach((row, index) => {
      if (selectionIncludes(state, row[keyColumn])) selected.add(index);
    });
    return selected;
  }, [keyColumn, rows, state]);

  const selectRow = (row: ClioDataRow) => {
    const value = keyColumn === undefined ? undefined : row[keyColumn];
    if (keyColumn !== undefined && isSelectionValue(value)) {
      // Clicking the one selected row again clears the selection.
      const onlyThis =
        state?.field === keyColumn && state.values.length === 1 && selectionIncludes(state, value);
      setSelection?.({ field: keyColumn, values: onlyThis ? [] : [value], source: componentId });
    }
    action?.();
  };

  return (
    <ClioDataTable
      columns={columns}
      description={a2uiAccessibilityDescription(accessibility)}
      label={a2uiAccessibilityLabel(accessibility)}
      onRowClick={setSelection || action ? selectRow : undefined}
      rows={rows}
      selectedRows={selectedRows}
      server={server}
    />
  );
}

interface ClioDataTableArtifactSourceProps {
  accessibility?: A2UIAccessibility;
  action?: () => void;
  columns?: ClioDataColumn[];
  componentId: string;
  dataQuery?: TableDataQuery;
  dataUri: string;
  selection?: unknown;
  selectionField?: string;
  setSelection?: SelectionWriter;
}

/** A column's sampled kind, from the first non-null value the current page holds. */
// oxlint-disable-next-line react/only-export-components
export function columnKindFromRows(rows: readonly QueryRow[] | undefined, key: string): 'number' | 'text' {
  const sample = rows?.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
  return typeof sample === 'number' ? 'number' : 'text';
}

/** The viewer's own column filters, layered onto (never replacing) the producer's `dataQuery.filter`. */
// oxlint-disable-next-line react/only-export-components
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
 * Resolves `clio.data-table.v1`'s `dataUri` + `dataQuery` to rows through the
 * shared table-query client (the same one `clio.chart.v1` and `clio.map.v1`
 * use), then renders the same selectable table inline rows use, with the
 * viewer's own paging, sorting, and per-column filtering layered on top of —
 * never replacing — the producer's own `dataQuery`. `columns` (the display
 * header) is the producer's when given, else derived from the queried
 * result's own columns; an omitted `dataQuery.columns` asks the server for
 * every column of the referenced table. `limit` becomes the viewer's own
 * page size once paging takes over a static one-shot request.
 */
function ClioDataTableArtifactSource({
  accessibility,
  action,
  columns,
  componentId,
  dataQuery,
  dataUri,
  selection,
  selectionField,
  setSelection,
}: ClioDataTableArtifactSourceProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_DATA_TABLE_PAGE_SIZE);
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' } | undefined>(
    dataQuery?.sort,
  );
  const [filters, setFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(new Map());

  const requestColumns = useMemo(() => dataQuery?.columns ?? [], [dataQuery?.columns]);
  const effectiveDataQuery = useMemo<TableDataQuery>(
    () => ({
      ...dataQuery,
      filter: mergeFilters(dataQuery?.filter, filters),
      limit: pageSize,
      offset: pageIndex * pageSize,
      sort,
    }),
    [dataQuery, filters, pageIndex, pageSize, sort],
  );
  const { rows, loading, error, matchedRows } = useTableQueryRows({
    columns: requestColumns,
    data: undefined,
    dataQuery: effectiveDataQuery,
    dataUri,
  });
  const renderColumns = useMemo<ClioDataColumn[] | undefined>(() => {
    if (columns) return columns;
    return rows?.[0] ? Object.keys(rows[0]) : undefined;
  }, [columns, rows]);

  const handlePaginationChange = useCallback(
    (next: { pageIndex: number; pageSize: number }) => {
      setPageSize(next.pageSize);
      setPageIndex(next.pageIndex);
    },
    [],
  );
  const handleSortChange = useCallback(
    (next: { column: string; direction: 'asc' | 'desc' } | undefined) => {
      setSort(next);
      setPageIndex(0);
    },
    [],
  );
  const handleFilterChange = useCallback(
    (column: string, value: ClioColumnFilterValue | undefined) => {
      setFilters((current) => {
        const next = new Map(current);
        if (value) next.set(column, value);
        else next.delete(column);
        return next;
      });
      setPageIndex(0);
    },
    [],
  );
  const columnKind = useCallback((key: string) => columnKindFromRows(rows, key), [rows]);
  // Stable across renders unless one of its own values actually changed — a
  // fresh object every render would rebuild ClioDataTable's whole column
  // list (and every column's filter control) on every keystroke and refetch.
  const server = useMemo<ClioDataTableServerControl>(
    () => ({
      columnKind,
      filters,
      onFilterChange: handleFilterChange,
      onPaginationChange: handlePaginationChange,
      onSortChange: handleSortChange,
      pageIndex,
      pageSize,
      pageSizeOptions: DATA_TABLE_PAGE_SIZES,
      sort,
      totalRows: matchedRows ?? rows?.length ?? 0,
    }),
    [columnKind, filters, handleFilterChange, handlePaginationChange, handleSortChange, matchedRows, pageIndex, pageSize, rows, sort],
  );

  if (error) {
    return (
      <Frame dense role="group">
        <FrameHeader className="flex-row items-center gap-2">
          <Table2Icon aria-hidden="true" className="size-4 text-primary" />
          <FrameTitle>Data table</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-destructive">Table unavailable: {error}</p>
        </FramePanel>
      </Frame>
    );
  }
  if (loading || !rows || !renderColumns) {
    return (
      <Frame dense role="group">
        <FrameHeader className="flex-row items-center gap-2">
          <Table2Icon aria-hidden="true" className="size-4 text-primary" />
          <FrameTitle>Data table</FrameTitle>
          <FrameDescription>Loading rows…</FrameDescription>
        </FrameHeader>
        <FramePanel className="p-0">
          <Skeleton aria-label="Loading data table" className="h-48 w-full rounded-none" />
        </FramePanel>
      </Frame>
    );
  }
  return (
    <ClioSelectableDataTable
      accessibility={accessibility}
      action={action}
      columns={renderColumns}
      componentId={componentId}
      rows={rows as ClioDataRow[]}
      selection={selection}
      selectionField={selectionField}
      server={server}
      setSelection={setSelection}
    />
  );
}

const dataTableDataProperties = {
  columns: z
    .array(z.union([z.string(), z.object({ key: z.string(), label: z.string() }).strict()]))
    .optional(),
  rows: z.array(z.record(z.unknown())).optional(),
  dataUri: z.string().regex(/^artifact:\/\/artifact_[A-Za-z0-9_-]+$/u).optional(),
  dataQuery: dataQuerySchema.optional(),
  // clio-schemas 0.5.1: a DynamicValue (a plain string, the old form, still parses).
  selection: CommonSchemas.DynamicValue.optional(),
  // A dataset column name; required when `selection` is bound (mirrors the chart's selectionField).
  selectionField: fieldNameSchema.optional(),
  action: CommonSchemas.Action.optional(),
  accessibility: CommonSchemas.AccessibilityAttributes.optional(),
  weight: z.number().optional(),
};

type DataTableShape = z.infer<z.ZodObject<typeof dataTableDataProperties>>;

/** `clio.data-table.v1`'s cross-field rules: exactly one of `rows` or `dataUri`. */
function checkDataTableComponent(value: DataTableShape, context: z.RefinementCtx): void {
  if (Boolean(value.rows) === Boolean(value.dataUri)) {
    context.addIssue({ code: 'custom', message: 'Provide exactly one of rows or dataUri' });
  }
  if (value.rows && !value.columns) {
    context.addIssue({ code: 'custom', message: 'columns is required with inline rows' });
  }
  if (value.dataQuery && !value.dataUri) {
    context.addIssue({ code: 'custom', message: 'dataQuery applies only to dataUri' });
  }
  if (isBoundToPath(value.selection) && !value.selectionField) {
    context.addIssue({ code: 'custom', message: 'selectionField is required when selection is bound' });
  }
}

// The catalog adapter shares the validated schema with the selectable table above.
// oxlint-disable-next-line react/only-export-components
export const dataTableComponentSchema = refinedStrictObject(
  dataTableDataProperties,
  checkDataTableComponent,
);

// oxlint-disable-next-line react/only-export-components
export const ClioDataTableCatalogComponent = createComponentImplementation(
  { name: 'clio.data-table.v1', schema: dataTableComponentSchema },
  ({ props, context }) => {
    const setSelection = isBoundToPath(context.componentModel.properties.selection)
      ? (props.setSelection as unknown as SelectionWriter)
      : undefined;
    if (props.dataUri) {
      return (
        <ClioDataTableArtifactSource
          accessibility={props.accessibility}
          action={props.action ? () => void props.action?.() : undefined}
          columns={props.columns as ClioDataColumn[] | undefined}
          componentId={context.componentModel.id}
          dataQuery={props.dataQuery as TableDataQuery | undefined}
          dataUri={props.dataUri}
          selection={props.selection}
          selectionField={props.selectionField}
          setSelection={setSelection}
        />
      );
    }
    return (
      <ClioSelectableDataTable
        accessibility={props.accessibility}
        action={props.action ? () => void props.action?.() : undefined}
        columns={props.columns as ClioDataColumn[]}
        componentId={context.componentModel.id}
        rows={props.rows as ClioDataRow[]}
        selection={props.selection}
        selectionField={props.selectionField}
        setSelection={setSelection}
      />
    );
  },
);
