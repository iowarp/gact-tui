import { useEffect, useMemo, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useAutoDatasetSelection } from '@/lib/a2ui/auto-dataset-selection';
import { inlineSelectionKey } from '@/lib/a2ui/inline-selection-key';
import { cn } from '@/lib/utils';
import type { ScenegraphEvent, View } from 'vega';
import { MousePointerSquareDashedIcon, ZoomInIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
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
import { canvasAvailable, embedChart, prepareChartSpec, type ChartRenderer } from './chart-embed';
import { chartJpegBlob, chartPngBlob, chartSvgText } from './chart-export';
import { withDefaultProjectionFit } from './chart-projection-fit';
import { bindChartSelection, translateChartSelectionValues, viewHasSignal, type ChartSelectionBinding } from './chart-selection';
import { CHART_SPEC_RULES } from './chart-spec-guard';
import {
  bindChartBoxSelection,
  chartBoxSelectionValues,
  chartClickSelectionValues,
  clearManualChartZoom,
  zoomChartToRows,
  withManualChartZoom,
  withChartBoxSelection,
  withChartLinePointTargets,
  chartMarkSelectionValue,
  nearestChartSeriesValue,
  withChartPointSelection,
  type ChartAxisType,
} from './chart-box-selection';
import { chartAxisType, cloneRows, describeChart, isContinuousAxis } from './chart-view-helpers';
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

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** A Vega-Lite chart over inline or artifact rows, with a selection linkable across components. */
export function ClioChart(props: ClioChartProps) {
  const { accessibility, componentId, height = DEFAULT_CHART_HEIGHT, title, weight } = props;
  const { colorField, entityField, facetField, preset, xField, xType, yField } = props;
  const autoSelection = useAutoDatasetSelection(props.dataUri);
  const inlineField = props.selectionField ?? entityField;
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
  const inlineRows = useMemo(
    () => props.data && selectsSeries
      ? props.data.map((row, index) => ({ ...row, __row: row.__row ?? index }))
      : props.data,
    [props.data, selectsSeries],
  );
  const selectionField = props.selectionField ??
    (selectsSeries || (autoActive && !props.dataQuery?.aggregate) ? '__row' : entityField);
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
    [colorField, entityField, facetField, markSelectionField, param, preset, rawSpec, selectsSeries, xField, xType, yField],
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
  const viewRef = useRef<View | undefined>(undefined);
  const bindingRef = useRef<ChartSelectionBinding | undefined>(undefined);
  const boxSelectionBindingRef = useRef<{ dispose: () => void } | undefined>(undefined);
  const dataRefreshCountRef = useRef(0);
  const rowsRef = useRef(displayRows);
  const selectionRef = useRef(selectionState);
  const wholeCurveBrushRef = useRef(false);
  const additiveBrushRef = useRef(false);
  const setSelectionRef = useRef(setSelection);
  const [embedError, setEmbedError] = useState('');
  const [darkTheme, setDarkTheme] = useState(isDarkTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setDarkTheme(isDarkTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  const [zoomActive, setZoomActive] = useState(false);
  const [linkable, setLinkable] = useState(true);
  const [fullscreen, setFullscreen] = useSurfaceFullScreen();
  const [boxSelectMode, setBoxSelectMode] = useState(false);
  const [boxReady, setBoxReady] = useState(false);
  const chartHeight = fullscreen
    ? Math.max(
        height,
        Math.min(preset === 'boxplot' ? 640 : Number.POSITIVE_INFINITY, window.innerHeight - 180),
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
    () => built.spec
      ? (preset === 'trajectories' || preset === 'spectra'
        ? withChartLinePointTargets(withChartPointSelection(built.spec, param, markSelectionField))
        : withChartPointSelection(built.spec, param, selectionField))
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
      rows ?? [], selectionField, markSelectionField, selectionState.values,
    );
  }, [markSelectionField, rows, selectionField, selectionState]);
  const selectedCandidate =
    markSelectionField && selectedMarkValues.length === 1 && !selectsSeries
      ? String(selectedMarkValues[0])
      : '';
  const handleSelectCandidate = (raw: string) => {
    const value = selectionCandidates.find((candidate) => String(candidate) === raw);
    if (value === undefined) return;
    const values = selectsSeries && entityField && selectionField
      ? translateChartSelectionValues(rows ?? [], entityField, selectionField, [value])
      : [value];
    void bindingRef.current?.select(values);
    if (selectionField) setSelectionRef.current?.({ field: selectionField, source: componentId, values });
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

  useEffect(() => {
    setSelectionRef.current = setSelection;
  }, [setSelection]);
  useEffect(() => {
    rowsRef.current = displayRows;
    const view = viewRef.current;
    if (!view || !displayRows) return;
    dataRefreshCountRef.current += 1;
    view.data('source', cloneRows(displayRows));
    const finishRefresh = () => {
      dataRefreshCountRef.current = Math.max(0, dataRefreshCountRef.current - 1);
    };
    void view.runAsync().then(finishRefresh, (error: unknown) => {
      finishRefresh();
      if (viewRef.current === view) {
        setEmbedError(error instanceof Error ? error.message : String(error));
      }
    });
  }, [displayRows]);

  // One embedded view per chart definition; rows and the selection only update it.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !embedSpec || !hasRows || measuredWidth <= 0) return;
    let cancelled = false;
    let finalize: (() => void) | undefined;
    // Snapshotted once, here — `rowsRef.current` can move on during the
    // `await embedChart(...)` gap below (a `[displayRows]` update arriving
    // before this promise settles). The `[displayRows]` effect above only pushes an update
    // into an ALREADY-embedded view (`viewRef.current` is still unset for
    // the whole gap), so without the re-check after `.then` resolves, such
    // an update is a lost write: silently dropped until some later,
    // unrelated rows change happened to come along.
    const embeddedRows = rowsRef.current;
    // Renderer default (owner ruling, feedback_affordances_are_renderer_defaults.md
    // — #1549 G4 review): a geoshape mark needs projection.fit to actually
    // draw, and the agent should never have to know that. See
    // chart-projection-fit.ts; an agent-authored fit always wins.
    const prepared = withDefaultProjectionFit(
      prepareChartSpec(embedSpec, {
        height: chartHeight,
        rows: cloneRows(embeddedRows ?? []),
        // Vega lays legends outside the plot width. Leave room inside the
        // surface so categorical and continuous legends remain readable.
        width: Math.max(220, measuredWidth - (colorField ? 112 : 0)),
      }),
      embeddedRows ?? [],
    );
    embedChart(node, prepared, { dark: darkTheme, renderer })
      .then(async (result) => {
        if (cancelled) {
          result.finalize();
          return;
        }
        finalize = result.finalize;
        const view = result.view;
        setEmbedError('');
        viewRef.current = view;
        // Region capture reads the same rendered Vega view and row set that
        // this component uses, so its box context can name enclosed rows.
        (
          node as HTMLDivElement & {
            __clioChart?: {
              view: View;
              rows: () => readonly ChartRow[];
              xField?: string;
              yField?: string;
            };
          }
        ).__clioChart = {
          view,
          rows: () => rowsRef.current ?? [],
          xField,
          yField,
        };
        setZoomActive(false);
        const zoomListener = (_name: string, value: unknown) => {
          if (!value || typeof value !== 'object') return setZoomActive(false);
          const domains = value as Record<string, unknown>;
          setZoomActive(Array.isArray(domains.x) && Array.isArray(domains.y));
        };
        if (zoomParam && viewHasSignal(view, zoomParam)) {
          view.addSignalListener(zoomParam, zoomListener);
          const previousFinalize = finalize;
          finalize = () => {
            view.removeSignalListener(zoomParam, zoomListener);
            previousFinalize?.();
          };
        }
        if (rowsRef.current && rowsRef.current !== embeddedRows) {
          view.data('source', cloneRows(rowsRef.current));
          await view.runAsync();
        }
        const canLink = viewHasSignal(view, param);
        setLinkable(canLink);
        let boxBound = false;
        if (boxSelectionParam && selectionField && viewHasSignal(view, boxSelectionParam)) {
          boxBound = true;
          boxSelectionBindingRef.current = bindChartBoxSelection(view, {
            param: boxSelectionParam,
            read: (signal) =>
              chartBoxSelectionValues(signal, {
                rows: rowsRef.current ?? [],
                selectionField,
                xField: xField!,
                xType: xAxisType,
                yField: yField!,
                yType: yAxisType,
              }),
            shouldIgnoreSignal: () => dataRefreshCountRef.current > 0,
            write: (values) => {
              // The shared state echoes this chart's own source back unchanged.
              // Update Vega's point selection here so a box also highlights
              // the individual marks, including on standalone inline charts.
              const markValues = wholeCurveBrushRef.current && entityField && selectionField
                ? translateChartSelectionValues(
                    rowsRef.current ?? [], entityField, selectionField,
                    translateChartSelectionValues(rowsRef.current ?? [], selectionField, entityField, values),
                  )
                : values;
              const previous = additiveBrushRef.current && selectionRef.current?.field === selectionField
                ? selectionRef.current.values : [];
              const merged = additiveBrushRef.current
                ? [...new Set([...previous, ...markValues])]
                : markValues;
              void bindingRef.current?.select(merged);
              setSelectionRef.current?.({ field: selectionField, source: componentId, values: merged });
            },
          });
        } else if (boxSelectMode) {
          setEmbedError('Box selection is unavailable for this chart.');
        }
        if (!canLink) {
          if (boxSelectMode) setEmbedError('Selection is unavailable for this chart.');
          return;
        }
        const binding = bindChartSelection(view, {
          componentId,
          param,
          field: markSelectionField,
          write: (state) => {
            if (!selectionField || !markSelectionField) return;
            const values = translateChartSelectionValues(
              rowsRef.current ?? [], markSelectionField, selectionField, state.values,
            );
            setSelectionRef.current?.({ field: selectionField, source: componentId, values });
          },
        });
        bindingRef.current = binding;
        const handleBrushPointerDown = (event: ScenegraphEvent) => {
          wholeCurveBrushRef.current = Boolean(event.ctrlKey || event.metaKey);
          additiveBrushRef.current = Boolean(event.shiftKey);
        };
        view.addEventListener('pointerdown', handleBrushPointerDown);
        const previousFinalizeForBrush = finalize;
        finalize = () => {
          view.removeEventListener('pointerdown', handleBrushPointerDown);
          previousFinalizeForBrush?.();
        };
        if (selectsSeries && selectionField && markSelectionField) {
          // Vega-Lite's line hit can report a stale series, so resolve the
          // closest plotted point or path against the current rows.
          let pendingClick: number | undefined;
          const handleSeriesClick = (event: ScenegraphEvent, item: unknown) => {
            if (!('clientX' in event) || !('clientY' in event)) return;
            const plot = node.querySelector('canvas, svg')?.getBoundingClientRect();
            const hit = plot && xField && yField && entityField
              ? nearestChartSeriesValue(
                  view,
                  rowsRef.current ?? [],
                  { x: event.clientX - plot.left, y: event.clientY - plot.top },
                  xField, yField, entityField, xAxisType, selectionField,
                )
              : undefined;
            const fallback = chartMarkSelectionValue(item, markSelectionField);
            if (!hit && fallback === undefined) return;
            const wholeCurve = Boolean(event.ctrlKey || event.metaKey || hit?.kind === 'line');
            const targets = wholeCurve && hit && entityField
              ? translateChartSelectionValues(rowsRef.current ?? [], entityField, selectionField, [hit.series])
              : hit?.point !== undefined ? [hit.point] : fallback !== undefined ? [fallback] : [];
            if (!targets.length) return;
            const current = selectionRef.current;
            const previous = current?.field === selectionField
              ? current.values
              : [];
            const values = chartClickSelectionValues(previous, targets, Boolean(event.shiftKey));
            const next = { field: selectionField, source: componentId, values };
            selectionRef.current = next;
            // Run after Vega-Lite's own click handler so the same selection
            // store is authoritative for the highlight and outgoing reference.
            if (pendingClick !== undefined) window.clearTimeout(pendingClick);
            pendingClick = window.setTimeout(() => {
              pendingClick = undefined;
              void binding.select(values);
              setSelectionRef.current?.(next);
            }, 0);
          };
          view.addEventListener('click', handleSeriesClick);
          const previousFinalize = finalize;
          finalize = () => {
            if (pendingClick !== undefined) window.clearTimeout(pendingClick);
            view.removeEventListener('click', handleSeriesClick);
            previousFinalize?.();
          };
        }
        const current = selectionRef.current;
        if (current && selectionField && markSelectionField) {
          await binding.apply({
            field: markSelectionField,
            values: translateChartSelectionValues(
              rowsRef.current ?? [], selectionField, markSelectionField, current.values,
            ),
          });
        }
        if (boxSelectMode && boxBound) setBoxReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setEmbedError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
      bindingRef.current?.dispose();
      bindingRef.current = undefined;
      boxSelectionBindingRef.current?.dispose();
      boxSelectionBindingRef.current = undefined;
      viewRef.current = undefined;
      delete (node as HTMLDivElement & { __clioChart?: unknown }).__clioChart;
      finalize?.();
    };
    // `fullscreen` forces a full re-embed on every toggle: `SurfaceFullScreenHost`
    // moves this view's own host node between two PORTAL targets (inline vs.
    // dialog) rather than remounting the React tree, so this effect's deps
    // alone would never re-run on that move and Vega's view stayed sized (and,
    // once actually observed live, sometimes blank) for whichever container it
    // was first embedded into. A clean re-embed is simpler and more robust
    // than trying to make an imperative Vega view tolerate a silent DOM move.
  }, [
    colorField,
    componentId,
    darkTheme,
    embedSpec,
    entityField,
    fullscreen,
    hasRows,
    chartHeight,
    measuredWidth,
    param,
    renderer,
    selectionField,
    markSelectionField,
    selectsSeries,
    xField,
    xAxisType,
    yAxisType,
    yField,
    boxSelectionParam,
    boxSelectMode,
    zoomParam,
  ]);

  // A selection written by another component on this surface shows here.
  useEffect(() => {
    selectionRef.current = selectionState;
    if (selectionState && selectionField && markSelectionField) {
      void bindingRef.current?.apply({
        field: markSelectionField,
        values: translateChartSelectionValues(
          rowsRef.current ?? [], selectionField, markSelectionField, selectionState.values,
        ),
      });
    }
  }, [markSelectionField, selectionField, selectionState]);

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
    const completeCurves = Boolean(selectsSeries && entityField && selectedCurves &&
      (displayRows ?? []).filter((row) => selectedZoomRows.some((selectedRow) =>
        selectedRow[entityField] === row[entityField])).length === selectedZoomRows.length);
    const zoneDescription = selected
      ? completeCurves
        ? `${selectedCurves.toLocaleString()} selected ${selectedCurves === 1 ? 'curve' : 'curves'} containing ${selectedZoomRows.length.toLocaleString()} of ${totalRows.toLocaleString()} rows`
        : `${selectedZoomRows.length.toLocaleString()} selected ${selectsSeries ? (selectedZoomRows.length === 1 ? 'point' : 'points') : (selectedZoomRows.length === 1 ? 'row' : 'rows')} of ${totalRows.toLocaleString()}`
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
          <DropdownMenuSubTrigger>Select a {selectsSeries ? entityField : markSelectionField} by keyboard</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup onValueChange={handleSelectCandidate} value={selectedCandidate}>
              {selectionCandidates.map((candidate) => (
                <DropdownMenuRadioItem key={String(candidate)} value={String(candidate)}>
                  {String(candidate)}
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
      <div className="flex shrink-0 items-center gap-1">
        {selectedZoomRows.length ? (
          <Button
            aria-label="Zoom to selection"
            onClick={zoomToSelection}
            size="icon-sm"
            title="Zoom to selection"
            variant="ghost"
          >
            <ZoomInIcon aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
        {zoomActive ? <ChartZoomResetButton onClick={resetChartZoom} /> : null}
      </div>
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
              ? 'Box select points. Hold Ctrl and drag to select whole curves. Shift adds to the selection.'
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
            ? 'Click a point to select it. Ctrl-click selects its curve. Shift adds or removes. Drag to select points; Ctrl-drag selects curves. Alt+drag pans and Ctrl+wheel zooms.'
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
            <p className="p-4 text-sm text-destructive">Chart unavailable: {failure}</p>
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
                <div className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none" />
              ) : null}
              {boxSelectMode && !boxReady && hasRows && spec ? (
                <div
                  className="absolute inset-0 z-10 grid place-items-center bg-background/70 text-xs text-muted-foreground"
                  role="status"
                >
                  Preparing box selection
                </div>
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
          {!failure && note ? <p className="py-2 text-xs text-muted-foreground">{note}</p> : null}
          {!failure && !linkable && selection !== undefined ? (
            <p className="py-2 text-xs text-muted-foreground">
              This chart has no “{param}” selection, so it neither follows nor shares the linked
              selection.
            </p>
          ) : null}
        </div>
      </SurfaceFullScreenHost>
    </section>
  );
}

function ChartZoomResetButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      aria-label="Reset zoom"
      className="shrink-0"
      onClick={onClick}
      size="icon-sm"
      title="Reset zoom"
      variant="ghost"
    >
      <RetryIcon aria-hidden="true" className="size-3.5" />
    </Button>
  );
}
