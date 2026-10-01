import { MapIcon } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Frame, FrameHeader, FramePanel, FrameTitle } from '@/components/reui/frame';
import { Skeleton } from '@/components/ui/skeleton';
import { useRepository } from '@/hooks/use-repository';
import type { A2UIAccessibility } from './a2ui-accessibility';
import { ClioScientificMap } from './a2ui-map';
import { DataFilterPopover, type DataFilterField } from './data-filter-popover';
import { pointsFromRows, type MapFieldNames } from './map-points';
import {
  columnKindFromRows,
  columnKindFromSchema,
  describeQueryFilter,
  mergeFilters,
} from './data-query-filters';
import type { ClioColumnFilterValue } from './data-table-column-filter';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import type { SelectionWriter } from './selection-state';
import { filenameStemFromTitle } from './surface-export';
import type { SurfaceCapabilities, SurfaceExportFormat } from './surface-toolbar';
import { artifactIdFromDataUri, useTableQueryRows, type TableDataQuery } from './table-query-rows';
import { downloadServerTableExport, type ServerExportQuery } from './table-export-client';

export interface ClioMapArtifactSourceProps extends MapFieldNames {
  accessibility?: A2UIAccessibility;
  title?: string;
  dataUri: string;
  dataQuery?: TableDataQuery;
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
  detailField,
  categoryField,
  selectionField,
  title = 'Locations',
  ...rest
}: ClioMapArtifactSourceProps) {
  const columns = useMemo(() => {
    const names = [
      latitudeField,
      longitudeField,
      labelField,
      idField,
      detailField,
      categoryField,
      selectionField,
    ];
    return [...new Set(names.filter((name): name is string => Boolean(name)))];
  }, [
    categoryField,
    detailField,
    idField,
    labelField,
    latitudeField,
    longitudeField,
    selectionField,
  ]);
  // The same server-side filter controls the table gets, layered onto (never
  // replacing) the producer's own `dataQuery.filter` (owner ruling, #1533).
  const [filters, setFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(new Map());
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
    for (const key of [categoryField, detailField]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const kind = columnKindFromSchema(schema, key) ?? columnKindFromRows(rows, key);
      fields.push({ key, kind, label: key.replaceAll('_', ' ') });
    }
    return fields;
  }, [categoryField, detailField, rows, schema]);
  const filterPopover = filterableFields.length ? (
    <DataFilterPopover
      fields={filterableFields}
      filters={filters}
      onFilterChange={handleFilterChange}
    />
  ) : undefined;
  const buildReference = (): DataZoneReference => {
    const total = matchedRows ?? rows?.length ?? 0;
    const shown = returnedRows ?? rows?.length ?? 0;
    const previewColumns = [
      idField,
      labelField,
      categoryField,
      latitudeField,
      longitudeField,
    ].filter((name): name is string => Boolean(name));
    return buildZoneReference({
      componentLabel: title,
      datasetLabel: artifactIdFromDataUri(dataUri) ?? dataUri,
      filters: (effectiveDataQuery?.filter ?? []).map(describeQueryFilter),
      previewColumns,
      previewRows: (rows ?? []).slice(0, 5),
      query: { dataQuery: effectiveDataQuery, dataUri },
      zoneDescription:
        shown < total
          ? `${shown.toLocaleString()} of ${total.toLocaleString()} points`
          : `the whole view (${total.toLocaleString()} points)`,
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
  const dataCapabilities: Pick<SurfaceCapabilities, 'exportFormats' | 'buildReference' | 'filters'> = {
    buildReference: rows ? buildReference : undefined,
    exportFormats: rows ? dataExportFormats : undefined,
    filters: filterPopover,
  };
  const reducedCaption =
    matchedRows !== undefined && returnedRows !== undefined && returnedRows < matchedRows
      ? `Showing ${returnedRows.toLocaleString()} of ${matchedRows.toLocaleString()} points.`
      : '';
  const points = useMemo(
    () =>
      rows
        ? pointsFromRows(rows, {
            categoryField,
            detailField,
            idField,
            labelField,
            latitudeField,
            longitudeField,
            selectionField,
          })
        : undefined,
    [
      categoryField,
      detailField,
      idField,
      labelField,
      latitudeField,
      longitudeField,
      rows,
      selectionField,
    ],
  );

  if (error) {
    return (
      <Frame dense role="group">
        <FrameHeader className="flex-row items-center gap-2">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <FrameTitle>{title}</FrameTitle>
        </FrameHeader>
        <FramePanel>
          <p className="text-sm text-destructive">Map unavailable: {error}</p>
        </FramePanel>
      </Frame>
    );
  }
  if (loading || !points) {
    return (
      <Frame dense role="group">
        <FrameHeader className="flex-row items-center gap-2">
          <MapIcon aria-hidden="true" className="size-4 text-primary" />
          <FrameTitle>{title}</FrameTitle>
        </FrameHeader>
        <FramePanel className="p-0">
          <Skeleton aria-label={`Loading ${title} map`} className="h-[26rem] w-full rounded-none" />
        </FramePanel>
      </Frame>
    );
  }
  return (
    <div className="grid gap-1">
      <ClioScientificMap
        {...rest}
        dataCapabilities={dataCapabilities}
        points={points}
        selectionField={selectionField}
        title={title}
      />
      {reducedCaption ? <p className="text-xs text-muted-foreground">{reducedCaption}</p> : null}
    </div>
  );
}
