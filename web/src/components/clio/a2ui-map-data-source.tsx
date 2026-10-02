import { useCallback, useMemo, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import { useAutoDatasetSelection } from '@/lib/a2ui/auto-dataset-selection';
import type { A2UIAccessibility } from './a2ui-accessibility';
import { ClioScientificMap } from './a2ui-map';
import { DataFilterPopover, type DataFilterField } from './data-filter-popover';
import { pointsFromRows, trajectoriesFromRows, type MapFieldNames } from './map-points';
import {
  columnKindFromRows,
  columnKindFromSchema,
  describeQueryFilter,
  mergeFilters,
} from './data-query-filters';
import type { ClioColumnFilterValue } from './data-table-column-filter';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import { parseSelectionState, selectionIncludes, type SelectionWriter } from './selection-state';
import { filenameStemFromTitle } from './surface-export';
import type { SurfaceCapabilities, SurfaceExportFormat } from './surface-toolbar';
import { artifactIdFromDataUri, useTableQueryRows, type TableDataQuery } from './table-query-rows';
import { downloadServerTableExport, type ServerExportQuery } from './table-export-client';

export interface ClioMapArtifactSourceProps extends MapFieldNames {
  accessibility?: A2UIAccessibility;
  title?: string;
  valueLabel?: string;
  valueUnit?: string;
  dataUri: string;
  dataQuery?: TableDataQuery;
  filterFields?: string[];
  selected?: string;
  action?: () => void;
  actionLabel?: string;
  componentId?: string;
  selection?: unknown;
  setSelection?: SelectionWriter;
}

/**
 * Resolves `clio.map.v1`'s `dataUri` + `*Field` names to points, then renders
 * the map. Split out of `a2ui-map.tsx` (the file-size ratchet,
 * `check_frontend_file_size.mjs`) — this is the `dataUri` data-fetching/G0
 * export-and-filter wrapper around the pure renderer `ClioScientificMap`,
 * which stays in `a2ui-map.tsx` alongside the inline-`points` path and the
 * component schema.
 */
export function ClioMapArtifactSource({
  dataQuery,
  dataUri,
  latitudeField,
  longitudeField,
  labelField,
  idField,
  trackField,
  orderField,
  filterFields,
  detailField,
  categoryField,
  valueField,
  valueLabel,
  valueUnit,
  selectionField,
  title = 'Locations',
  ...rest
}: ClioMapArtifactSourceProps) {
  const autoSelection = useAutoDatasetSelection(dataUri);
  const effectiveSelectionField =
    selectionField ??
    (autoSelection.active && !rest.setSelection && !dataQuery?.aggregate ? '__row' : undefined);
  const effectiveSelection = rest.setSelection ? rest.selection : autoSelection.selection;
  const effectiveSetSelection = rest.setSelection ?? autoSelection.setSelection;
  const columns = useMemo(() => {
    const names = [
      latitudeField,
      longitudeField,
      labelField,
      idField,
      trackField,
      orderField,
      ...(filterFields ?? []),
      detailField,
      categoryField,
      valueField,
      effectiveSelectionField,
    ];
    return [...new Set(names.filter((name): name is string => Boolean(name) && name !== '__row'))];
  }, [
    categoryField,
    valueField,
    detailField,
    idField,
    trackField,
    orderField,
    filterFields,
    labelField,
    latitudeField,
    longitudeField,
    effectiveSelectionField,
  ]);
  // The same server-side filter controls the table gets, layered onto (never
  // replacing) the producer's own `dataQuery.filter` (owner ruling, #1533).
  const [filters, setFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(new Map());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const handleFilterChange = useCallback(
    (key: string, value: ClioColumnFilterValue | undefined) => {
      setFilters((current) => {
        const next = new Map(current);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      });
    },
    [],
  );
  const effectiveDataQuery = useMemo<TableDataQuery | undefined>(() => {
    const merged = mergeFilters(dataQuery?.filter, filters);
    if (!merged.length) return dataQuery;
    return { ...dataQuery, filter: merged };
  }, [dataQuery, filters]);
  const { rows, loading, error, matchedRows, returnedRows, schema } = useTableQueryRows({
    columns,
    data: undefined,
    dataQuery: effectiveDataQuery,
    dataUri,
  });
  const filterableFields = useMemo<DataFilterField[]>(() => {
    const seen = new Set<string>();
    const fields: DataFilterField[] = [];
    for (const key of filterFields ?? [categoryField, trackField, valueField, detailField]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      if (filterFields?.includes(key)) {
        const type = schema?.find((column) => column.name === key)?.type;
        const precision = type?.match(/^timestamp\[(ns|us|ms|s)/)?.[1];
        const sample = rows?.find((row) => row[key] !== null && row[key] !== undefined)?.[key];
        if (precision || (typeof sample === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sample))) {
          const years = new Set(
            rows
              ?.map((row) => String(row[key] ?? '').slice(0, 4))
              .filter((year) => /^\d{4}$/.test(year)),
          );
          const kind = filters.get(key)?.kind === 'year' || years.size > 1 ? 'year' : 'date';
          fields.push({
            key,
            kind,
            label: kind === 'year' ? 'Year' : 'Date',
            precision: (precision as DataFilterField['precision']) ?? 'text',
          });
          continue;
        }
      }
      const kind = columnKindFromSchema(schema, key) ?? columnKindFromRows(rows, key);
      fields.push({ key, kind, label: key.replaceAll('_', ' ') });
    }
    return fields;
  }, [categoryField, trackField, valueField, detailField, filterFields, filters, rows, schema]);
  const filterPopover = filterableFields.length ? (
    <DataFilterPopover
      fields={filterableFields}
      filters={filters}
      onFilterChange={handleFilterChange}
      onOpenChange={setFiltersOpen}
    />
  ) : undefined;
  const selection = parseSelectionState(effectiveSelection);
  const selectedValues =
    effectiveSelectionField && selection?.field === effectiveSelectionField ? selection.values : [];
  const selectedRows =
    selectedValues.length && rows && effectiveSelectionField
      ? rows.filter((row) =>
          selectionIncludes(selection, effectiveSelectionField, row[effectiveSelectionField]),
        )
      : [];
  const visibleSelectedValues = effectiveSelectionField
    ? selectedRows
        .map((row) => row[effectiveSelectionField])
        .filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
    : [];
  const buildReference = (): DataZoneReference => {
    const total = matchedRows ?? rows?.length ?? 0;
    const shown = returnedRows ?? rows?.length ?? 0;
    const previewColumns = [
      idField,
      labelField,
      categoryField,
      valueField,
      latitudeField,
      longitudeField,
    ].filter((name): name is string => Boolean(name));
    return buildZoneReference({
      componentLabel: title,
      datasetLabel: artifactIdFromDataUri(dataUri) ?? dataUri,
      filters: (effectiveDataQuery?.filter ?? []).map(describeQueryFilter),
      previewColumns,
      previewRows: visibleSelectedValues.length ? selectedRows : (rows ?? []).slice(0, 5),
      query: {
        dataQuery: effectiveDataQuery,
        dataUri,
        ...(visibleSelectedValues.length
          ? { selection: { field: effectiveSelectionField, values: visibleSelectedValues } }
          : {}),
      },
      zoneDescription: visibleSelectedValues.length
        ? `${visibleSelectedValues.length.toLocaleString()} selected ${visibleSelectedValues.length === 1 ? 'point' : 'points'} of ${total.toLocaleString()}`
        : shown < total
          ? `the filtered current view (${shown.toLocaleString()} of ${total.toLocaleString()} points)`
          : `the filtered current view (${total.toLocaleString()} points)`,
    });
  };
  // G0 data export (mirrors `a2ui-chart.tsx`'s csv/csv-full pair): the
  // server's `table-export` route, reusing this viewer's own live
  // filter/query (`scope: "current"`) or the whole, unfiltered dataset
  // (`scope: "full"`). JSON is offered for the current view only — a second
  // "JSON (full dataset)" entry would double the menu for a format reference
  // reaches for far less often than CSV.
  const repository = useRepository();
  const filenameStem = filenameStemFromTitle(title);
  const currentExportQuery: ServerExportQuery = {
    aggregate: effectiveDataQuery?.aggregate,
    columns: columns.length ? columns : undefined,
    // Mirrors the chart's own fix (#516 review item 16): without this, a
    // producer-requested downsample (e.g. for a dense point layer) applied
    // to what's actually drawn would silently NOT apply to its own "current
    // view" export, returning a different row set than the map shows.
    downsample: effectiveDataQuery?.downsample,
    filter: effectiveDataQuery?.filter,
    sort: effectiveDataQuery?.sort,
  };
  const dataExportFormats: SurfaceExportFormat[] = [
    {
      id: 'csv',
      label: 'CSV (current view)',
      run: () =>
        downloadServerTableExport({
          dataUri,
          filenameStem,
          format: 'csv',
          query: currentExportQuery,
          repository,
          scope: 'current',
        }),
    },
    {
      id: 'json',
      label: 'JSON (current view)',
      run: () =>
        downloadServerTableExport({
          dataUri,
          filenameStem,
          format: 'json',
          query: currentExportQuery,
          repository,
          scope: 'current',
        }),
    },
    {
      id: 'csv-full',
      label: 'CSV (full dataset)',
      run: () =>
        downloadServerTableExport({
          dataUri,
          filenameStem,
          format: 'csv',
          query: {},
          repository,
          scope: 'full',
        }),
    },
  ];
  const dataCapabilities: Pick<
    SurfaceCapabilities,
    'exportFormats' | 'buildReference' | 'filters'
  > = {
    buildReference: rows ? buildReference : undefined,
    exportFormats: rows ? dataExportFormats : undefined,
    filters: filterPopover ? { content: filterPopover, isOpen: filtersOpen } : undefined,
  };
  const reducedCaption =
    matchedRows !== undefined && returnedRows !== undefined && returnedRows < matchedRows
      ? `Showing ${returnedRows.toLocaleString()} of ${matchedRows.toLocaleString()} points.`
      : '';
  const points = useMemo(
    () =>
      rows
        ? pointsFromRows(rows, {
            categoryField: categoryField ?? (valueField ? undefined : trackField),
            valueField,
            detailField,
            idField,
            labelField,
            latitudeField,
            longitudeField,
            selectionField: effectiveSelectionField,
          })
        : undefined,
    [
      categoryField,
      trackField,
      valueField,
      detailField,
      idField,
      labelField,
      latitudeField,
      longitudeField,
      rows,
      effectiveSelectionField,
    ],
  );
  const geometry = useMemo(
    () =>
      rows && points && trackField && orderField
        ? trajectoriesFromRows(rows, points, trackField, orderField)
        : undefined,
    [rows, points, trackField, orderField],
  );

  if (error) {
    return (
      <div className="min-w-0 space-y-2" role="group">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-sm text-destructive">Map unavailable: {error}</p>
      </div>
    );
  }
  if (loading || !points) {
    return (
      <div className="min-w-0 space-y-2" role="group">
        <h3 className="text-sm font-medium">{title}</h3>
        <Skeleton aria-label={`Loading ${title} map`} className="h-[26rem] w-full rounded-none" />
      </div>
    );
  }
  return (
    <div className="grid gap-1">
      <ClioScientificMap
        {...rest}
        dataCapabilities={dataCapabilities}
        points={points}
        geometry={geometry}
        geometrySelectionByPoints={Boolean(geometry)}
        selection={effectiveSelection}
        selectionField={effectiveSelectionField}
        setSelection={effectiveSetSelection}
        title={title}
        valueLabel={valueLabel ?? valueField}
        valueUnit={valueUnit}
      />
      {reducedCaption ? (
        <p className="text-xs text-muted-foreground">
          {geometry ? `${reducedCaption} Trajectories may be incomplete.` : reducedCaption}
        </p>
      ) : null}
    </div>
  );
}
