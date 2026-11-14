import { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useAutoDatasetSelection } from '@/lib/a2ui/auto-dataset-selection';
import { inlineSelectionKey } from '@/lib/a2ui/inline-selection-key';
import { LoadingFeedback } from './loading-feedback';
import { DataTableRequestState } from './data-table-request-state';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import type { ClioColumnFilterValue } from './data-table-column-filter';
import {
  applyClientFilters,
  columnKindFromRows,
  columnKindFromSchema,
  describeQueryFilter,
  mergeFilters,
} from './data-query-filters';
import type { ClioDataColumn, ClioDataRow, ClioDataTableServerControl } from './data-table';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import {
  isSelectionValue,
  parseSelectionState,
  selectionForField,
  selectionIncludes,
  type SelectionState,
  type SelectionWriter,
} from './selection-state';
import type { SurfaceCapabilities, SurfaceExportFormat } from './surface-toolbar';
import { filenameStemFromTitle } from './surface-export';
import {
  downloadInlineRowsAsCsv,
  downloadInlineRowsAsJson,
  downloadServerTableExport,
  type ServerExportFormat,
  type ServerExportQuery,
} from './table-export-client';
import {
  artifactIdFromDataUri,
  type QueryRow,
  type TableDataQuery,
  useTableQueryRows,
} from './table-query-rows';
import { ph, plural, t } from '@lingui/core/macro';

// The grid (TanStack Table) loads with the first table instead of with the app.
const ClioDataTable = lazy(() =>
  import('./data-table').then((module) => ({ default: module.ClioDataTable })),
);

/**
 * Page sizes offered for a `dataUri` table, paging through the whole dataset
 * server-side. The table sits inside the conversation, so it opens on a short
 * page that keeps the surrounding messages in view; the reader picks a larger
 * page when they want to scan.
 */
const DATA_TABLE_PAGE_SIZES = [10, 25, 50, 100, 500] as const;
const DEFAULT_DATA_TABLE_PAGE_SIZE = 10;

/** The G0 download menu for a `dataUri` table: every server-export format, current view and full dataset. */
const EXPORT_FORMATS: readonly ServerExportFormat[] = ['csv', 'json', 'parquet'];
const EXPORT_FORMAT_LABELS: Record<ServerExportFormat, string> = {
  csv: 'CSV',
  json: 'JSON',
  parquet: 'Parquet',
};

function columnKey(column: ClioDataColumn): string {
  return typeof column === 'string' ? column : column.key;
}

export interface ClioSelectableDataTableProps {
  /** Rows per page at first (the producer's `pageSize`). */
  pageSize?: number;
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
  /**
   * Download / "Reference this" affordances, built by `ClioDataTableArtifactSource`
   * for a `dataUri` table (server-side export of the current filtered/sorted
   * view or the full dataset, and a page-aware zone reference). Omitted for a
   * direct, inline-rows caller (the catalog's non-`dataUri` branch, and plain
   * callers/tests) — `ClioSelectableDataTable` then builds its own
   * client-side CSV/JSON export and "whole table" reference from `rows`
   * itself (G0 point 5: "Full screen, Reference this and Filters on
   * inline-data views too").
   */
  capabilities?: SurfaceCapabilities;
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
  capabilities,
  columns,
  componentId,
  rows,
  selection,
  selectionField,
  server,
  setSelection,
  pageSize,
}: ClioSelectableDataTableProps) {
  const [localSelectedOnly, setLocalSelectedOnly] = useState(false);
  const [localSelection, setLocalSelection] = useState<SelectionState>();
  const [inlineFilters, setInlineFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(
    new Map(),
  );
  const [inlineSort, setInlineSort] = useState<{ column: string; desc: boolean } | undefined>();
  const keys = useMemo(() => columns.map(columnKey), [columns]);
  const inlineIdentity = useMemo(() => {
    if (server || setSelection) return undefined;
    const candidates = (selectionField ? [selectionField] : keys)
      .map((field) => {
        const values = rows.map((row) => row[field]);
        const key = inlineSelectionKey(values);
        const namedEntity =
          /(^|[_ -])(id|key|station|site|event|name|label|location)($|[_ -])/iu.test(field);
        const score = namedEntity ? 2 : values.every((value) => typeof value === 'string') ? 1 : 0;
        return { field, key, score };
      })
      .filter((candidate) => candidate.key && candidate.score > 0)
      .sort((left, right) => right.score - left.score);
    return candidates[0];
  }, [keys, rows, selectionField, server, setSelection]);
  const autoInlineSelection = useAutoDatasetSelection(inlineIdentity?.key);
  const effectiveSelection = setSelection
    ? selection
    : (selection ?? autoInlineSelection.selection ?? localSelection);
  const boundField = setSelection ? parseSelectionState(effectiveSelection)?.field : undefined;
  const keyColumn =
    selectionField ??
    (boundField && keys.includes(boundField) ? boundField : undefined) ??
    (autoInlineSelection.active ? inlineIdentity?.field : undefined) ??
    keys[0];
  const state = useMemo(() => {
    if (setSelection && !selectionField && boundField && !keys.includes(boundField)) {
      return undefined;
    }
    return selectionForField(parseSelectionState(effectiveSelection), keyColumn);
  }, [boundField, effectiveSelection, keyColumn, keys, selectionField, setSelection]);
  const writeSelection = setSelection ?? autoInlineSelection.setSelection ?? setLocalSelection;
  const filteredRows = useMemo(
    () =>
      server ? rows : (applyClientFilters(rows as QueryRow[], inlineFilters) as ClioDataRow[]),
    [inlineFilters, rows, server],
  );
  const orderedRows = useMemo(() => {
    if (server || !inlineSort) return filteredRows;
    const { column, desc } = inlineSort;
    return [...filteredRows].sort((left, right) => {
      const a = left[column];
      const b = right[column];
      if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
      if (b === null || b === undefined) return -1;
      const compared =
        typeof a === 'number' && typeof b === 'number'
          ? a - b
          : String(a).localeCompare(String(b), undefined, { numeric: true });
      return desc ? -compared : compared;
    });
  }, [filteredRows, inlineSort, server]);
  const selectedFilteredRows = useMemo(
    () =>
      state && keyColumn && !server
        ? orderedRows.filter((row) => selectionIncludes(state, keyColumn, row[keyColumn]))
        : [],
    [keyColumn, orderedRows, server, state],
  );
  const selectedFilteredValues = useMemo(
    () =>
      keyColumn
        ? [...new Set(selectedFilteredRows.map((row) => row[keyColumn]).filter(isSelectionValue))]
        : [],
    [keyColumn, selectedFilteredRows],
  );
  const changeInlineFilter = (column: string, value: ClioColumnFilterValue | undefined) => {
    setInlineFilters((current) => {
      const next = new Map(current);
      if (value) next.set(column, value);
      else next.delete(column);
      return next;
    });
  };
  const heading = a2uiAccessibilityLabel(accessibility) ?? t`Data table`;
  // The G0 default for a table used directly with inline rows (no dataUri,
  // so no server route to export through and no live page/filter to
  // describe as a "zone"): a plain client-side CSV/JSON of exactly what is
  // shown, and a reference to the whole table. An empty table has nothing
  // worth downloading or referencing. Only used when the caller supplies no
  // `capabilities` of its own — `ClioDataTableArtifactSource` always does.
  const inlineCapabilities = useMemo<SurfaceCapabilities>(() => {
    if (!filteredRows.length) return {};
    const filenameStem = filenameStemFromTitle(heading);
    // `ClioDataRow`'s cells are `unknown` (the component's own schema is
    // `z.record(z.unknown())`); the export helpers want the narrower
    // `QueryRow` shape the server/table-query path already guarantees.
    // `rowsToCsv`/`rowsToJson` stringify (or `?? null`) whatever a cell holds
    // regardless, so this is a type-level widening only, not a runtime risk.
    const exportRows = orderedRows as unknown as QueryRow[];
    const exportFormats: SurfaceExportFormat[] = [
      {
        id: 'csv',
        label: t`CSV data`,
        run: () => downloadInlineRowsAsCsv(keys, exportRows, filenameStem),
      },
      {
        id: 'json',
        label: t`JSON data`,
        run: () => downloadInlineRowsAsJson(keys, exportRows, filenameStem),
      },
      // No Parquet entry here: this repo has no client-side Parquet encoder
      // for inline rows — only the server's table-export route produces one,
      // and inline rows (no dataUri) never reach the server.
    ];
    const buildReference = (): DataZoneReference => {
      const selectedCount = selectedFilteredValues.length;
      const totalText = filteredRows.length.toLocaleString();
      return buildZoneReference({
        componentLabel: heading,
        datasetLabel: 'inline data',
        filters: mergeFilters(undefined, inlineFilters).map(describeQueryFilter),
        previewColumns: keys.slice(0, selectedFilteredValues.length ? 12 : 5),
        previewRows: selectedFilteredValues.length
          ? selectedFilteredRows.slice(0, 5)
          : orderedRows.slice(0, 5),
        query: {
          columns: keys,
          rowCount: filteredRows.length,
          rows: selectedFilteredValues.length ? selectedFilteredRows : orderedRows,
          ...(selectedFilteredValues.length && keyColumn
            ? { selection: { field: keyColumn, values: selectedFilteredValues } }
            : {}),
        },
        zoneDescription: selectedCount
          ? plural(selectedCount, {
              one: `# selected row of ${totalText}`,
              other: `# selected rows of ${totalText}`,
            })
          : plural(filteredRows.length, {
              one: 'the filtered current view (# row)',
              other: 'the filtered current view (# rows)',
            }),
      });
    };
    return { buildReference, exportFormats };
  }, [
    filteredRows,
    heading,
    inlineFilters,
    keyColumn,
    keys,
    orderedRows,
    selectedFilteredRows,
    selectedFilteredValues,
  ]);
  const toolbarCapabilities: SurfaceCapabilities = {
    ...(capabilities ?? inlineCapabilities),
    captureComponentId: componentId,
  };
  const selectedOnly = server ? Boolean(server.selectedOnly) : localSelectedOnly;
  const visibleRows = useMemo(() => {
    if (server || !selectedOnly || !state?.values.length || keyColumn === undefined)
      return orderedRows;
    return selectedFilteredRows;
  }, [keyColumn, orderedRows, selectedFilteredRows, selectedOnly, server, state]);
  const selectedRows = useMemo(() => {
    if (!state || keyColumn === undefined) return undefined;
    const selected = new Set<number>();
    visibleRows.forEach((row, index) => {
      if (selectionIncludes(state, keyColumn, row[keyColumn])) selected.add(index);
    });
    return selected;
  }, [keyColumn, visibleRows, state]);

  // The last plain (non-shift) row click, so a following shift-click can
  // select every row between the two — a table "zone" (#1533 item 4), the
  // same idea as a brushed chart range or a map rectangle: many rows' own
  // `keyColumn` values become the shared selection at once. Scoped to the
  // current page, since that is what `rows`/row indexes refer to.
  const rangeAnchorRef = useRef<number | undefined>(undefined);

  const selectRow = (row: ClioDataRow, interaction: { index: number; shiftKey: boolean }) => {
    if (keyColumn === undefined) {
      action?.();
      return;
    }
    if (interaction.shiftKey && rangeAnchorRef.current !== undefined) {
      const [start, end] = [rangeAnchorRef.current, interaction.index].sort((a, b) => a - b);
      const values = visibleRows
        .slice(start, end + 1)
        .map((candidate) => candidate[keyColumn])
        .filter(isSelectionValue);
      writeSelection({ field: keyColumn, values, source: componentId });
      action?.();
      return;
    }
    rangeAnchorRef.current = interaction.index;
    const value = row[keyColumn];
    if (isSelectionValue(value)) {
      // Clicking the one selected row again clears the selection.
      const onlyThis = state?.values.length === 1 && selectionIncludes(state, keyColumn, value);
      writeSelection({ field: keyColumn, values: onlyThis ? [] : [value], source: componentId });
    }
    action?.();
  };

  return (
    <Suspense fallback={<LoadingFeedback label={t`Loading table…`} variant="skeleton" />}>
      <ClioDataTable
        capabilities={toolbarCapabilities}
        columns={columns}
        description={a2uiAccessibilityDescription(accessibility)}
        label={heading}
        showLabel={Boolean(a2uiAccessibilityLabel(accessibility))}
        onRowClick={selectRow}
        rows={visibleRows}
        selectedRows={selectedRows}
        selectedOnly={selectedOnly && Boolean(state?.values.length)}
        selectedCount={server ? (state?.values.length ?? 0) : selectedFilteredValues.length}
        onSelectedOnlyChange={server ? server.onSelectedOnlyChange : setLocalSelectedOnly}
        externalSelection={Boolean(
          state?.values.length && state.source && state.source !== componentId,
        )}
        server={server}
        initialPageSize={pageSize}
        inlineFilters={server ? undefined : inlineFilters}
        onInlineFilterChange={server ? undefined : changeInlineFilter}
        inlineSort={server ? undefined : inlineSort}
        onInlineSortChange={server ? undefined : setInlineSort}
      />
    </Suspense>
  );
}

interface ClioDataTableArtifactSourceProps {
  /** Rows per page at first (the producer's `pageSize`). */
  pageSize?: number;
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

// Re-exported for callers (and this module's own tests) that imported these
// from here before they moved to the shared `data-query-filters.ts`, used
// now by `clio.chart.v1` and `clio.map.v1` too.
// oxlint-disable-next-line react/only-export-components
export { columnKindFromRows, mergeFilters };

/**
 * The wire `sort` to send: the viewer's own override when the reader has
 * clicked a header, else the producer's own base sort UNCHANGED (never `[]`)
 * — so clicking a sorted column's own direction a second time, which clears
 * the override (reui's own three-state toggle), restores the producer's
 * chosen ordering instead of falling through to no sort at all.
 */
// oxlint-disable-next-line react/only-export-components
export function resolveEffectiveSort(
  sortOverride: { column: string; desc: boolean } | undefined,
  baseSort: readonly { column: string; desc: boolean }[] | undefined,
): readonly { column: string; desc: boolean }[] {
  return sortOverride ? [sortOverride] : (baseSort ?? []);
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
export function ClioDataTableArtifactSource({
  accessibility,
  action,
  columns,
  componentId,
  dataQuery,
  dataUri,
  selection,
  selectionField,
  setSelection,
  pageSize: initialPageSize,
}: ClioDataTableArtifactSourceProps) {
  const autoSelection = useAutoDatasetSelection(dataUri);
  const effectiveSelectionField =
    selectionField ??
    (autoSelection.active && !setSelection && !dataQuery?.aggregate ? '__row' : undefined);
  const effectiveSelection = setSelection ? selection : autoSelection.selection;
  const effectiveSetSelection = setSelection ?? autoSelection.setSelection;
  const repository = useRepository();
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize ?? DEFAULT_DATA_TABLE_PAGE_SIZE);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const selectionState = useMemo(
    () => selectionForField(parseSelectionState(effectiveSelection), effectiveSelectionField),
    [effectiveSelection, effectiveSelectionField],
  );
  const selectedValues = useMemo(
    () =>
      effectiveSelectionField && selectionState?.field === effectiveSelectionField
        ? selectionState.values
        : [],
    [effectiveSelectionField, selectionState],
  );
  const selectedValuesKey = JSON.stringify(selectedValues);
  const activeSelectedOnly =
    selectedOnly && selectedValues.length > 0 && selectedValues.length <= 10_000;
  const [lastSelectedValuesKey, setLastSelectedValuesKey] = useState(selectedValuesKey);
  if (selectedValuesKey !== lastSelectedValuesKey) {
    setLastSelectedValuesKey(selectedValuesKey);
    if (selectedOnly) setPageIndex(0);
    if (!selectedValues.length) setSelectedOnly(false);
  }
  // The viewer's own sort override — a single key, since only one header is
  // ever clicked at a time. `undefined` means "no override": the producer's
  // own `dataQuery.sort` (already a list; multiple keys apply in order)
  // shows and applies unchanged, so clearing a click-to-sort column restores
  // the producer's base ordering rather than falling back to no sort at all.
  const [sortOverride, setSortOverride] = useState<{ column: string; desc: boolean } | undefined>(
    undefined,
  );
  const [filters, setFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(new Map());

  // A new artifact or a materially different base query is a new dataset:
  // the viewer's own page/sort/filter overrides describe the OLD one and
  // must not silently carry over (a stale filter that happens to still
  // parse could hide every row of the new table with no visible cause).
  // Adjusted during render (see https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes),
  // same pattern as `data-table-column-filter.tsx`'s `syncedValue`.
  const resetKey = `${dataUri}\u0000${JSON.stringify(dataQuery ?? null)}`;
  const [lastResetKey, setLastResetKey] = useState(resetKey);
  if (resetKey !== lastResetKey) {
    setLastResetKey(resetKey);
    setPageIndex(0);
    setSortOverride(undefined);
    setFilters(new Map());
  }

  const baseSort = dataQuery?.sort;
  const effectiveSort = useMemo(
    () => resolveEffectiveSort(sortOverride, baseSort),
    [baseSort, sortOverride],
  );
  const requestColumns = useMemo(() => dataQuery?.columns ?? [], [dataQuery?.columns]);
  const effectiveDataQuery = useMemo<TableDataQuery>(
    () => ({
      ...dataQuery,
      filter: [
        ...mergeFilters(dataQuery?.filter, filters),
        ...(activeSelectedOnly && effectiveSelectionField
          ? [{ column: effectiveSelectionField, op: 'in' as const, value: selectedValues }]
          : []),
      ],
      limit: pageSize,
      offset: pageIndex * pageSize,
      sort: effectiveSort,
    }),
    [
      activeSelectedOnly,
      dataQuery,
      effectiveSelectionField,
      effectiveSort,
      filters,
      pageIndex,
      pageSize,
      selectedValues,
    ],
  );
  const { rows, loading, refreshing, retry, error, matchedRows, schema } = useTableQueryRows({
    columns: requestColumns,
    data: undefined,
    dataQuery: effectiveDataQuery,
    dataUri,
  });
  // The server's own reported schema names every queried column regardless
  // of row count, so an empty (but successful) result still renders a real,
  // empty table instead of a skeleton that never resolves (a zero-row match
  // has no `rows[0]` to read column names from).
  const renderColumns = useMemo<ClioDataColumn[] | undefined>(() => {
    if (columns) return columns;
    if (schema?.length) return schema.map((column) => column.name);
    return rows?.[0] ? Object.keys(rows[0]) : undefined;
  }, [columns, rows, schema]);

  const handlePaginationChange = useCallback((next: { pageIndex: number; pageSize: number }) => {
    setPageSize(next.pageSize);
    setPageIndex(next.pageIndex);
  }, []);
  const handleSortChange = useCallback((next: { column: string; desc: boolean } | undefined) => {
    setSortOverride(next);
    setPageIndex(0);
  }, []);
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
  const columnKind = useCallback(
    (key: string) => columnKindFromSchema(schema, key) ?? columnKindFromRows(rows, key),
    [rows, schema],
  );
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
      sort: effectiveSort[0],
      totalRows: matchedRows ?? rows?.length ?? 0,
      selectedOnly: activeSelectedOnly,
      selectedCount: selectedValues.length,
      onSelectedOnlyChange: (next) => {
        setSelectedOnly(next);
        setPageIndex(0);
      },
    }),
    [
      columnKind,
      effectiveSort,
      filters,
      handleFilterChange,
      handlePaginationChange,
      handleSortChange,
      matchedRows,
      pageIndex,
      pageSize,
      rows,
      activeSelectedOnly,
      selectedValues.length,
    ],
  );

  if (error || loading || !rows || !renderColumns) {
    return (
      <DataTableRequestState
        error={error}
        retry={retry}
        filterCount={filters.size}
        clearFilters={() => {
          setFilters(new Map());
          setPageIndex(0);
        }}
      />
    );
  }
  const heading = a2uiAccessibilityLabel(accessibility) ?? t`Data table`;
  const buildReference = (): DataZoneReference => {
    const selectionState = selectionForField(
      parseSelectionState(effectiveSelection),
      effectiveSelectionField,
    );
    const selectedValues =
      effectiveSelectionField && selectionState?.field === effectiveSelectionField
        ? selectionState.values
        : [];
    const selectedRows =
      selectedValues.length && effectiveSelectionField
        ? rows.filter((row) =>
            selectionIncludes(
              selectionState,
              effectiveSelectionField,
              row[effectiveSelectionField],
            ),
          )
        : [];
    const total = matchedRows ?? rows.length;
    const start = pageIndex * pageSize + 1;
    const end = start + rows.length - 1;
    const previewColumns = renderColumns.slice(0, selectedValues.length ? 12 : 5).map(columnKey);
    const sort = effectiveSort[0];
    const sortColumn = sort?.column ?? '';
    const sortSuffix = sort
      ? sort.desc
        ? t`, sorted by ${sortColumn} desc`
        : t`, sorted by ${sortColumn} asc`
      : '';
    const selectedCount = selectedValues.length;
    const totalText = total.toLocaleString();
    const startText = start.toLocaleString();
    const endText = end.toLocaleString();
    const zoneDescription = selectedCount
      ? plural(selectedCount, {
          one: `# selected row of ${totalText}${sortSuffix}`,
          other: `# selected rows of ${totalText}${sortSuffix}`,
        })
      : start === 1 && end === total
        ? plural(total, {
            one: `the filtered current view (# row)${sortSuffix}`,
            other: `the filtered current view (# rows)${sortSuffix}`,
          })
        : t`filtered rows ${startText}–${endText} of ${totalText}${sortSuffix}`;
    return buildZoneReference({
      componentLabel: heading,
      datasetLabel: artifactIdFromDataUri(dataUri) ?? dataUri,
      filters: (effectiveDataQuery.filter ?? []).map(describeQueryFilter),
      previewColumns,
      previewRows: selectedValues.length ? selectedRows.slice(0, 5) : rows.slice(0, 5),
      query: {
        dataQuery: effectiveDataQuery,
        dataUri,
        ...(selectedValues.length
          ? { selection: { field: effectiveSelectionField, values: selectedValues } }
          : {}),
      },
      zoneDescription,
    });
  };
  // The "current view" export: the table's own live filter/sort/columns —
  // never `effectiveDataQuery`'s `limit`/`offset` (the viewer's own page
  // size), since "current view" means everything the reader has filtered or
  // sorted by, not only the page presently on screen. `scope: 'full'` below
  // ignores this query entirely and exports the whole, unfiltered dataset.
  const filenameStem = filenameStemFromTitle(heading);
  const currentExportQuery: ServerExportQuery = {
    aggregate: dataQuery?.aggregate,
    columns: dataQuery?.columns,
    downsample: dataQuery?.downsample,
    filter: effectiveDataQuery.filter,
    sort: effectiveDataQuery.sort,
  };
  const exportFormats: SurfaceExportFormat[] = EXPORT_FORMATS.flatMap((format) => [
    {
      id: format,
      label: t`${ph({ format: EXPORT_FORMAT_LABELS[format] })} (current view)`,
      run: () =>
        downloadServerTableExport({
          dataUri,
          filenameStem,
          format,
          query: currentExportQuery,
          repository,
          scope: 'current',
        }),
    },
    {
      id: `${format}-full`,
      label: t`${ph({ format: EXPORT_FORMAT_LABELS[format] })} (full dataset)`,
      run: () =>
        downloadServerTableExport({
          dataUri,
          filenameStem,
          format,
          query: {},
          repository,
          scope: 'full',
        }),
    },
  ]);
  const tableCapabilities: SurfaceCapabilities = { buildReference, exportFormats };
  return (
    <div className="grid min-w-0 gap-2">
      {refreshing ? <LoadingFeedback label={t`Updating rows…`} /> : null}
      <ClioSelectableDataTable
        accessibility={accessibility}
        action={action}
        capabilities={tableCapabilities}
        columns={renderColumns}
        componentId={componentId}
        rows={rows as ClioDataRow[]}
        selection={effectiveSelection}
        selectionField={effectiveSelectionField}
        server={server}
        setSelection={effectiveSetSelection}
      />
    </div>
  );
}
