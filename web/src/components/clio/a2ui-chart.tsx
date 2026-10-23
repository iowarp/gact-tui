import { useEffect, useMemo, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useAutoDatasetSelection } from '@/lib/a2ui/auto-dataset-selection';
import { inlineSelectionKey } from '@/lib/a2ui/inline-selection-key';
import { cn } from '@/lib/utils';
import { MousePointerSquareDashedIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingFeedback, LoadingFailure } from './loading-feedback';
import { ChartDataNotice } from './chart-data-notice';
import { ChartZoomActions } from './chart-zoom-actions';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import {
  artifactIdFromDataUri,
  chartQueryColumns,
  useChartRows,
  type ChartDataQuery,
  type ChartRow,
} from './chart-data';
import { canvasAvailable, type ChartRenderer } from './chart-embed';
import { useChartView } from './use-chart-view';
import { chartJpegBlob, chartPngBlob, chartSvgText } from './chart-export';
import { translateChartSelectionValues } from './chart-selection';
import { CHART_SPEC_RULES } from './chart-spec-guard';
import {
  clearManualChartZoom,
  zoomChartToRows,
  withManualChartZoom,
  withChartBoxSelection,
  withChartLinePointTargets,
  withChartPointSelection,
  type ChartAxisType,
} from './chart-box-selection';
import {
  chartAxisType,
  chartChannelField,
  describeChart,
  isContinuousAxis,
} from './chart-view-helpers';
import { buildSpec, distinctFieldValues } from './chart-spec-build';
import { DataFilterPopover, type DataFilterField } from './data-filter-popover';
import { dataViewFlexStyle } from './data-view-layout';
import type { ClioColumnFilterValue } from './data-table-column-filter';
import {
  applyClientFilters,
  columnKindFromRows,
  columnKindFromSchema,
  describeQueryFilter,
  mergeFilters,
} from './data-query-filters';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import {
  isSelectionValue,
  parseSelectionState,
  selectionForField,
  type SelectionState,
  type SelectionValue,
  type SelectionWriter,
} from './selection-state';
import {
  downloadBlob,
  downloadText,
  filenameStemFromTitle,
  resolveCardBackground,
} from './surface-export';
import { SurfaceFullScreenHost, useSurfaceFullScreen } from './surface-full-screen';
import {
  SurfaceToolbar,
  type SurfaceCapabilities,
  type SurfaceExportFormat,
} from './surface-toolbar';
import { downloadInlineRowsAsCsv, downloadServerTableExport } from './table-export-client';

export interface ClioChartProps {
  accessibility?: A2UIAccessibility;
  /** The chart component's id: written as a selection's `source`, so its own echo is ignored. */
  componentId: string;
  spec?: Record<string, unknown>;
  preset?: string;
  xField?: string;
  yField?: string;
  entityField?: string;
  colorField?: string;
  facetField?: string;
  xType?: string;
  data?: ChartRow[];
  dataUri?: string;
  dataQuery?: ChartDataQuery;
  /** The resolved `selection` binding, and its writer when the producer bound it to a path. */
  selection?: unknown;
  setSelection?: SelectionWriter;
  selectionParam?: string;
  selectionField?: string;
  title?: string;
  height?: number;
  /** Flex weight inside a Row/Column, as the Basic catalog components apply it. */
  weight?: number;
}

/** Default plot height when the producer names none. Unit: CSS pixels. */
const DEFAULT_CHART_HEIGHT = 320;

/** A Vega-Lite chart over inline or artifact rows, with a selection linkable across components. */
export function ClioChart(props: ClioChartProps) {
  const { accessibility, componentId, height = DEFAULT_CHART_HEIGHT, title, weight } = props;
  const { entityField, facetField, preset, xType } = props;
  const xField = props.xField ?? chartChannelField(props.spec, 'x');
  const yField = props.yField ?? chartChannelField(props.spec, 'y');
  const colorField = props.colorField ?? chartChannelField(props.spec, 'color');
  const declaredSelectionField =
    props.selectionField ?? parseSelectionState(props.selection)?.field;
  const autoSelection = useAutoDatasetSelection(props.dataUri);
  const inlineField = declaredSelectionField ?? entityField;
  const inlineKey = useMemo(
    () =>
      !props.dataUri && inlineField && props.data
        ? inlineSelectionKey(props.data.map((row) => row[inlineField]))
        : undefined,
    [inlineField, props.data, props.dataUri],
  );
  const autoInlineSelection = useAutoDatasetSelection(inlineKey);
  const autoActive = autoSelection.active && !props.setSelection;
  const [localSelection, setLocalSelection] = useState<SelectionState>();
  const setSelection =
    props.setSelection ??
    autoSelection.setSelection ??
    autoInlineSelection.setSelection ??
    setLocalSelection;
  const selection = props.setSelection
    ? props.selection
    : autoSelection.active
      ? autoSelection.selection
      : (props.selection ?? autoInlineSelection.selection ?? localSelection);
  const param = props.selectionParam ?? CHART_SPEC_RULES.defaultSelectionParam;
  const selectsSeries = preset === 'trajectories' || preset === 'spectra';
  const needsInlineRowIdentity =
    selectsSeries || (!props.dataUri && !declaredSelectionField && !inlineKey);
  const inlineRows = useMemo(
    () =>
      props.data && needsInlineRowIdentity
        ? props.data.map((row, index) => ({ ...row, __row: row.__row ?? index }))
        : props.data,
    [props.data, needsInlineRowIdentity],
  );
  const selectionField =
    declaredSelectionField ??
    (needsInlineRowIdentity || (autoActive && !props.dataQuery?.aggregate) ? '__row' : entityField);
  // Series geometry stays grouped by the entity even when automatic linking
  // uses __row to share exact observations with maps and tables.
  const markSelectionField = selectionField;
  // The binder hands a static `spec` over by reference, so this rebuilds only when it changes.
  const rawSpec = props.spec;
  const built = useMemo(
    () =>
      buildSpec(
        {
          colorField,
          // Series use the entity for line geometry; point selection stays
          // keyed to the exact row supplied by the renderer.
          entityField: selectsSeries ? entityField : markSelectionField,
          facetField,
          preset,
          spec: rawSpec,
          xField,
          xType,
          yField,
        },
        param,
      ),
    [
      colorField,
      entityField,
      facetField,
      markSelectionField,
      param,
      preset,
      rawSpec,
      selectsSeries,
      xField,
      xType,
      yField,
    ],
  );
  // `dataQuery` is rebuilt on every binder pass; key its projection by content.
  const queryColumnsKey = JSON.stringify(props.dataQuery?.columns ?? []);
  const columns = useMemo(
    () =>
      chartQueryColumns(JSON.parse(queryColumnsKey) as string[], built.spec, [
        xField,
        yField,
        entityField,
        colorField,
        facetField,
        selectionField,
      ]).filter((name) => name !== '__row'),
    [
      built.spec,
      colorField,
      entityField,
      facetField,
      queryColumnsKey,
      selectionField,
      xField,
      yField,
    ],
  );
  // This viewer's own per-column filters are layered onto — never replacing —
  // the producer's `dataQuery.filter`. Box selection changes linked selection
  // state only; it never filters or zooms the chart.
  const [filters, setFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(new Map());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const handleFilterChange = (key: string, value: ClioColumnFilterValue | undefined) => {
    setFilters((current) => {
      const next = new Map(current);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  };
  const effectiveDataQuery = useMemo<ChartDataQuery | undefined>(() => {
    const merged = mergeFilters(props.dataQuery?.filter, filters);
    if (!merged.length) return props.dataQuery;
    return { ...props.dataQuery, filter: merged };
  }, [filters, props.dataQuery]);
  const {
    rows,
    loading,
    refreshing,
    retry,
    error: dataError,
    matchedRows,
    note,
    schema,
  } = useChartRows({
    columns,
    data: inlineRows,
    dataQuery: effectiveDataQuery,
    dataUri: props.dataUri,
  });
  const selectionState = useMemo(
    () => selectionForField(parseSelectionState(selection), selectionField),
    [selection, selectionField],
  );

  // Inline (no `dataUri`) rows have no server to filter through; this viewer's
  // own per-column filters apply client-side. Box selection stays independent.
  const displayRows = useMemo(() => {
    if (props.dataUri || !rows) return rows;
    return filters.size ? applyClientFilters(rows, filters) : rows;
  }, [filters, props.dataUri, rows]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const [viewportHeight, setViewportHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    if (!fullscreen) return;
    const measure = () => setViewportHeight(window.innerHeight);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [fullscreen]);
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const chartHeight = fullscreen
    ? Math.max(
        height,
        Math.min(preset === 'boxplot' ? 640 : Number.POSITIVE_INFINITY, viewportHeight - 180),
      )
    : height;
  const boxplotWidthLimit =
    preset === 'boxplot' && xField && displayRows
      ? Math.min(960, Math.max(360, new Set(displayRows.map((row) => row[xField])).size * 180))
      : undefined;
  const [measuredWidth, setMeasuredWidth] = useState(0);
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const measure = () => setMeasuredWidth(Math.floor(node.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [fullscreen, boxplotWidthLimit]);
  const renderer = useMemo<ChartRenderer>(() => (canvasAvailable() ? 'canvas' : 'svg'), []);
  const spec = useMemo(
    () =>
      built.spec
        ? preset === 'trajectories' || preset === 'spectra'
          ? withChartLinePointTargets(
              withChartPointSelection(built.spec, param, markSelectionField),
            )
          : withChartPointSelection(built.spec, param, selectionField)
        : undefined,
    [built.spec, markSelectionField, param, preset, selectionField],
  );
  const hasRows = rows !== undefined;
  const boxSelectionInjection = useMemo(
    () =>
      spec
        ? withChartBoxSelection(spec, { pointParam: param, xField, yField, active: boxSelectMode })
        : { param: undefined, spec },
    [boxSelectMode, param, spec, xField, yField],
  );
  const boxSelectionParam = spec ? boxSelectionInjection.param : undefined;
  const xAxisType = chartAxisType(spec, 'x') ?? (xType as ChartAxisType | undefined);
  const yAxisType = chartAxisType(spec, 'y');
  const supportsManualZoom =
    Boolean(spec && xField && yField) && isContinuousAxis(xAxisType) && isContinuousAxis(yAxisType);
  const zoomInjection = useMemo(
    () =>
      boxSelectionInjection.spec && supportsManualZoom
        ? withManualChartZoom(boxSelectionInjection.spec, {
            pointParam: param,
            xField,
            yField,
          })
        : { param: undefined, spec: boxSelectionInjection.spec },
    [boxSelectionInjection.spec, param, supportsManualZoom, xField, yField],
  );
  const embedSpec = zoomInjection.spec;
  const zoomParam = spec && supportsManualZoom ? zoomInjection.param : undefined;
  const {
    viewRef,
    bindingRef,
    embedError,
    setEmbedError,
    zoomActive,
    setZoomActive,
    linkable,
    boxReady,
    setBoxReady,
  } = useChartView({
    containerRef,
    displayRows,
    colorRows: rows,
    selectionState,
    setSelection,
    embedSpec,
    hasRows,
    preset,
    entityField,
    colorField,
    chartHeight,
    measuredWidth,
    renderer,
    zoomParam,
    param,
    boxSelectionParam,
    selectionField,
    xField,
    yField,
    xAxisType,
    yAxisType,
    boxSelectMode,
    componentId,
    markSelectionField,
    selectsSeries,
    fullscreen,
  });
  const filterableFields = useMemo<DataFilterField[]>(() => {
    const seen = new Set<string>();
    const fields: DataFilterField[] = [];
    for (const key of [xField, yField, colorField, entityField]) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const kind = columnKindFromSchema(schema, key) ?? columnKindFromRows(rows, key);
      fields.push({ key, kind, label: key.replaceAll('_', ' ') });
    }
    return fields;
  }, [colorField, entityField, rows, schema, xField, yField]);
  // A keyboard-operable equivalent to clicking a point (#1533 #506 LOW): an
  // arbitrary brush/lasso drag has no sensible keyboard equivalent, but
  // choosing a distinct row value or series entity does. Capped, and
  // omitted past the cap, for the same reason the map's own point list now
  // virtualizes instead of rendering one control per row (MEDIUM 6) — a
  // flat, unvirtualized list stops being a reasonable "keyboard access"
  // affordance once a field is closer to a unique row id than a category.
  const selectionCandidates = useMemo(
    () => distinctFieldValues(rows, selectsSeries ? entityField : markSelectionField),
    [entityField, markSelectionField, rows, selectsSeries],
  );
  const selectedMarkValues = useMemo(() => {
    if (!selectionState || !selectionField || !markSelectionField) return [];
    return translateChartSelectionValues(
      rows ?? [],
      selectionField,
      markSelectionField,
      selectionState.values,
    );
  }, [markSelectionField, rows, selectionField, selectionState]);
  const selectedCandidate =
    markSelectionField && selectedMarkValues.length === 1 && !selectsSeries
      ? String(selectedMarkValues[0])
      : '';
  const selectionCandidateLabel = (candidate: SelectionValue): string => {
    if (selectsSeries || markSelectionField !== '__row') return String(candidate);
    const row = rows?.find((item) => item.__row === candidate);
    const fields = [...new Set([xField, colorField, yField].filter(Boolean))] as string[];
    const label =
      row &&
      fields
        .map((field) => row[field])
        .filter(isSelectionValue)
        .join(', ');
    return label || `Row ${typeof candidate === 'number' ? candidate + 1 : candidate}`;
  };
  const handleSelectCandidate = (raw: string) => {
    const value = selectionCandidates.find((candidate) => String(candidate) === raw);
    if (value === undefined) return;
    const values =
      selectsSeries && entityField && selectionField
        ? translateChartSelectionValues(rows ?? [], entityField, selectionField, [value])
        : [value];
    void bindingRef.current?.select(values);
    if (selectionField) setSelection?.({ field: selectionField, source: componentId, values });
  };
  const resetChartZoom = () => {
    const view = viewRef.current;
    if (!view || !zoomParam) return;
    // Vega-Lite stores scale-bound interval extents in the selection store.
    // Clearing the signal alone is overwritten by that store on the next run.
    clearManualChartZoom(view, zoomParam);
    setZoomActive(false);
  };
  const selectedZoomRows = useMemo(() => {
    if (!selectionField || selectionState?.field !== selectionField || !displayRows) return [];
    const values = new Set(selectionState.values);
    return displayRows.filter((row) => values.has(row[selectionField] as SelectionValue));
  }, [displayRows, selectionField, selectionState]);
  const zoomToSelection = () => {
    const view = viewRef.current;
    if (!view || !zoomParam || !xField || !yField || !selectedZoomRows.length) return;
    void zoomChartToRows(view, zoomParam, selectedZoomRows, xField, yField, xAxisType, yAxisType)
      .then((applied) => {
        if (applied) setZoomActive(true);
        else setEmbedError('Zoom unavailable: selected rows have no numeric x and y values.');
      })
      .catch((error: unknown) =>
        setEmbedError(error instanceof Error ? error.message : String(error)),
      );
  };

  const failure = built.error || dataError || embedError;

  const heading = title || 'Chart';
  const description = describeChart(spec, displayRows, loading, note);
  const label = a2uiAccessibilityLabel(accessibility) ?? `${heading} chart`;
  const buildReference = (): DataZoneReference => {
    const shownRows = (displayRows ?? []).length;
    const totalRows = props.dataUri ? (matchedRows ?? shownRows) : shownRows;
    const selectedValues = selectionField
      ? [...new Set(selectedZoomRows.map((row) => row[selectionField]).filter(isSelectionValue))]
      : [];
    const selected = selectedValues.length > 0;
    const selectedCurves = entityField
      ? new Set(selectedZoomRows.map((row) => row[entityField]).filter(isSelectionValue)).size
      : 0;
    const completeCurves = Boolean(
      selectsSeries &&
        entityField &&
        selectedCurves &&
        (displayRows ?? []).filter((row) =>
          selectedZoomRows.some((selectedRow) => selectedRow[entityField] === row[entityField]),
        ).length === selectedZoomRows.length,
    );
    const zoneDescription = selected
      ? completeCurves
        ? `${selectedCurves.toLocaleString()} selected ${selectedCurves === 1 ? 'curve' : 'curves'} containing ${selectedZoomRows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows`
        : `${selectedZoomRows.length.toLocaleString()} selected ${selectsSeries ? (selectedZoomRows.length === 1 ? 'point' : 'points') : selectedZoomRows.length === 1 ? 'row' : 'rows'} of ${totalRows.toLocaleString()}`
      : `the filtered current view (${totalRows.toLocaleString()} rows)`;
    return buildZoneReference({
      componentLabel: heading,
      datasetLabel: artifactIdFromDataUri(props.dataUri) ?? props.dataUri ?? 'inline data',
      filters: (effectiveDataQuery?.filter ?? []).map(describeQueryFilter),
      previewColumns: columns.slice(0, 5),
      previewRows: selected ? selectedZoomRows : (displayRows ?? []).slice(0, 5),
      query: {
        dataQuery: effectiveDataQuery,
        dataUri: props.dataUri,
        ...(!props.dataUri ? { rows: selected ? selectedZoomRows : (displayRows ?? []) } : {}),
        ...(selected ? { selection: { field: selectionField, values: selectedValues } } : {}),
      },
      zoneDescription: note ? `${zoneDescription}. ${note.replace(/\.$/u, '')}` : zoneDescription,
    });
  };

  const repository = useRepository();
  const filenameStem = filenameStemFromTitle(heading);
  const dataUri = props.dataUri;
  const currentExportQuery = {
    aggregate: effectiveDataQuery?.aggregate,
    columns: columns.length ? columns : undefined,
    // Without this, "CSV (current view)" silently exported a DIFFERENT row
    // set than what the chart actually plots whenever the producer's own
    // `dataQuery` requests a downsample (e.g. `per_entity_lttb`, a visually
    // representative subset) -- the export route defaults to no downsampling
    // at all when this is omitted (#516 review item 16).
    downsample: effectiveDataQuery?.downsample,
    filter: effectiveDataQuery?.filter,
    sort: effectiveDataQuery?.sort,
  };
  const exportFormats: SurfaceExportFormat[] = [
    {
      id: 'png',
      label: 'PNG image',
      run: async () => {
        if (!viewRef.current)
          throw new Error('Chart image is unavailable until the chart finishes rendering.');
        const background = resolveCardBackground(containerRef.current);
        downloadBlob(await chartPngBlob(viewRef.current, background), `${filenameStem}.png`);
      },
    },
    {
      id: 'svg',
      label: 'SVG image',
      run: async () => {
        if (!viewRef.current)
          throw new Error('Chart SVG is unavailable until the chart finishes rendering.');
        downloadText(await chartSvgText(viewRef.current), 'image/svg+xml', `${filenameStem}.svg`);
      },
    },
    {
      id: 'jpg',
      label: 'JPG image',
      run: async () => {
        if (!viewRef.current)
          throw new Error('Chart image is unavailable until the chart finishes rendering.');
        const background = resolveCardBackground(containerRef.current);
        downloadBlob(await chartJpegBlob(viewRef.current, background), `${filenameStem}.jpg`);
      },
    },
    {
      id: 'csv',
      label: dataUri ? 'CSV (current view)' : 'CSV data',
      run: async () => {
        if (dataUri) {
          await downloadServerTableExport({
            dataUri,
            filenameStem,
            format: 'csv',
            query: currentExportQuery,
            repository,
            scope: 'current',
          });
        } else if (displayRows) {
          const rowColumns = columns.length ? columns : Object.keys(displayRows[0] ?? {});
          downloadInlineRowsAsCsv(rowColumns, displayRows, filenameStem);
        }
      },
    },
    ...(dataUri
      ? [
          {
            id: 'csv-full',
            label: 'CSV (full dataset)',
            run: () =>
              downloadServerTableExport({
                dataUri,
                filenameStem,
                format: 'csv' as const,
                query: {},
                repository,
                scope: 'full' as const,
              }),
          },
        ]
      : []),
  ];
  const chartOverflowContent = (
    <>
      {linkable && markSelectionField && selectionCandidates.length > 0 ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            Select a{' '}
            {selectsSeries
              ? entityField
              : markSelectionField === '__row'
                ? 'row'
                : markSelectionField}{' '}
            by keyboard
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup onValueChange={handleSelectCandidate} value={selectedCandidate}>
              {selectionCandidates.map((candidate) => (
                <DropdownMenuRadioItem key={String(candidate)} value={String(candidate)}>
                  {selectionCandidateLabel(candidate)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      {description ? (
        <DropdownMenuItem
          className="max-w-72 whitespace-normal text-xs text-muted-foreground"
          disabled
          onSelect={(event) => event.preventDefault()}
        >
          {description}
        </DropdownMenuItem>
      ) : null}
    </>
  );
  const renderZoomActions = () =>
    zoomParam ? (
      <ChartZoomActions
        active={zoomActive}
        selected={selectedZoomRows.length > 0}
        onZoom={zoomToSelection}
        onReset={resetChartZoom}
      />
    ) : null;
  const renderBoxSelectAction = () =>
    boxSelectionParam ? (
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={selectsSeries ? 'Box select chart points' : 'Box select chart rows'}
              aria-pressed={boxSelectMode}
              className={cn(
                'shrink-0 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 max-sm:opacity-100',
                boxSelectMode && 'opacity-100',
              )}
              onClick={() => {
                setBoxReady(false);
                setBoxSelectMode((active) => !active);
              }}
              size="icon-sm"
              variant={boxSelectMode ? 'secondary' : 'ghost'}
            >
              <MousePointerSquareDashedIcon aria-hidden="true" className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent align="end" side="bottom">
            {selectsSeries
              ? 'Drag to select points. Ctrl-drag selects whole curves. Shift adds or removes.'
              : 'Box select. Drag a rectangle to select rows. Click again to exit.'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : null;
  const toolbarCapabilities: SurfaceCapabilities = {
    captureComponentId: componentId,
    buildReference: hasRows && (!boxSelectMode || boxReady) ? buildReference : undefined,
    onReferenced: () => setBoxSelectMode(false),
    exportFormats: hasRows ? exportFormats : undefined,
    filters: filterableFields.length
      ? {
          content: (
            <DataFilterPopover
              fields={filterableFields}
              filters={filters}
              onFilterChange={handleFilterChange}
              onOpenChange={setFiltersOpen}
            />
          ),
          isOpen: filtersOpen,
        }
      : undefined,
    fullScreen: { isOpen: fullscreen, onToggle: () => setFullscreen(!fullscreen) },
    overflowContent: chartOverflowContent,
    selectionHint:
      linkable && selectionField ? (
        <span>
          {zoomParam
            ? 'Click a point to select it. Ctrl-click selects its curve. Shift-click toggles a point; Ctrl+Shift-click merges or removes a curve. Drag selects points; Ctrl-drag selects curves. Alt+drag pans and Ctrl+wheel zooms.'
            : 'Choose Box select or hold Shift and drag to select matching rows.'}
        </span>
      ) : undefined,
  };

  return (
    <section
      {...a2uiAccessibilityProps(accessibility)}
      aria-label={label}
      className="group relative min-w-0"
      data-slot="a2ui-chart"
      data-a2ui-component-id={componentId}
      data-visual-state={failure ? 'failed' : loading ? 'loading' : 'ready'}
      role="group"
      style={dataViewFlexStyle(weight)}
    >
      <div className="mb-2 flex min-w-0 items-start gap-3">
        <h3
          className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-snug"
          title={heading}
        >
          {heading}
        </h3>
        <div className="flex shrink-0 items-center gap-0.5">
          {renderBoxSelectAction()}
          {renderZoomActions()}
          <SurfaceToolbar capabilities={toolbarCapabilities} floating={false} />
        </div>
      </div>
      {refreshing ? <LoadingFeedback label="Updating chart…" /> : null}
      <SurfaceFullScreenHost
        fullscreen={fullscreen}
        headerExtra={
          <div className="flex items-center gap-0.5">
            {renderBoxSelectAction()}
            {renderZoomActions()}
            {/* The dialog already has its own "Exit full screen" button. */}
            <SurfaceToolbar
              capabilities={{ ...toolbarCapabilities, fullScreen: undefined }}
              floating={false}
            />
          </div>
        }
        onOpenChange={setFullscreen}
        title={heading}
      >
        <div className="min-w-0">
          {failure ? (
            <LoadingFailure
              title="Chart unavailable"
              detail={failure}
              onRetry={dataError ? retry : undefined}
            />
          ) : (
            <div
              aria-label={`${heading}: ${description}`}
              className={cn(
                'relative min-w-0 overflow-x-auto',
                boxplotWidthLimit && 'flex justify-center',
                boxSelectMode && 'cursor-crosshair',
              )}
              role="img"
              style={{ minHeight: chartHeight }}
            >
              {!hasRows || !spec ? (
                <LoadingFeedback
                  label="Loading chart…"
                  variant="skeleton"
                  className="absolute inset-0"
                />
              ) : null}
              {boxSelectMode && !boxReady && hasRows && spec ? (
                <LoadingFeedback label="Preparing box selection" variant="overlay" />
              ) : null}
              {/* Vega owns this node's children; React never renders into it. */}
              <div
                data-renderer={renderer}
                data-slot="a2ui-chart-view"
                ref={containerRef}
                style={
                  boxplotWidthLimit ? { width: `min(100%, ${boxplotWidthLimit}px)` } : undefined
                }
              />
            </div>
          )}
          {!failure ? (
            <ChartDataNotice
              note={note}
              empty={!loading && rows?.length === 0}
              unlinkedSelection={!linkable && selection !== undefined}
              param={param}
            />
          ) : null}
        </div>
      </SurfaceFullScreenHost>
    </section>
  );
}
