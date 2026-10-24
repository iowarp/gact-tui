import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ScenegraphEvent, View } from 'vega';
import type { ChartRow } from './chart-data';
import { embedChart, prepareChartSpec, type ChartRenderer } from './chart-embed';
import { useThemeKey } from '@/theme/runtime';
import { withDefaultProjectionFit } from './chart-projection-fit';
import { withSeriesLegend } from './chart-series-legend';
import {
  chartCategoryDomains,
  withChartCategoryColors,
  type ChartCategoryDomains,
} from './chart-category-colors';
import { chartSideLegendSpace } from './chart-presentation';
import { resizeChartView, type ChartSize } from './chart-responsive-layout';
import {
  bindChartSelection,
  translateChartSelectionValues,
  viewHasSignal,
  type ChartSelectionBinding,
} from './chart-selection';
import {
  bindChartBoxSelection,
  chartBoxSelectionValues,
  chartClickSelectionValues,
  chartMarkSelectionValue,
  nearestChartSeriesValue,
  type ChartAxisType,
} from './chart-box-selection';
import { cloneRows } from './chart-view-helpers';
import type { SelectionState, SelectionWriter } from './selection-state';

interface ChartViewOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  displayRows: ChartRow[] | undefined;
  colorRows: ChartRow[] | undefined;
  selectionState: SelectionState | undefined;
  setSelection: SelectionWriter | undefined;
  embedSpec: Record<string, unknown> | undefined;
  hasRows: boolean;
  preset?: string;
  entityField?: string;
  colorField?: string;
  chartHeight: number;
  measuredWidth: number;
  renderer: ChartRenderer;
  zoomParam?: string;
  param: string;
  boxSelectionParam?: string;
  selectionField?: string;
  xField?: string;
  yField?: string;
  xAxisType?: ChartAxisType;
  yAxisType?: ChartAxisType;
  boxSelectMode: boolean;
  componentId: string;
  markSelectionField?: string;
  selectsSeries: boolean;
  fullscreen: boolean;
}

/** Owns the Vega view lifecycle, row updates, and linked selection bindings. */
export function useChartView({
  containerRef,
  displayRows,
  colorRows,
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
}: ChartViewOptions) {
  const viewRef = useRef<View | undefined>(undefined);
  const bindingRef = useRef<ChartSelectionBinding | undefined>(undefined);
  const boxSelectionBindingRef = useRef<{ dispose: () => void } | undefined>(undefined);
  const dataRefreshCountRef = useRef(0);
  const rowsRef = useRef(displayRows);
  const sizeRef = useRef<ChartSize>({
    width: measuredWidth,
    height: chartHeight,
    fillHeight: fullscreen,
  });
  const resizeRef = useRef<((size: ChartSize) => Promise<void>) | undefined>(undefined);
  useEffect(() => {
    sizeRef.current = { width: measuredWidth, height: chartHeight, fillHeight: fullscreen };
  }, [measuredWidth, chartHeight, fullscreen]);
  const selectionRef = useRef(selectionState);
  const wholeCurveBrushRef = useRef(false);
  const additiveBrushRef = useRef(false);
  const setSelectionRef = useRef(setSelection);
  const [embedError, setEmbedError] = useState('');
  // Colors are resolved from the theme at embed time, so a theme change re-embeds.
  const theme = useThemeKey();
  // Use the unfiltered source domain: hiding a category must not recolour the rest
  // or rebuild the view and lose the person's zoom/selection. New categories can
  // extend the domain, retaining the identities of those already present.
  const categoryDomainKey = useMemo(
    () => JSON.stringify(chartCategoryDomains(embedSpec ?? {}, colorRows ?? [])),
    [embedSpec, colorRows],
  );
  const categoricalSpec = useMemo(
    () =>
      embedSpec &&
      withChartCategoryColors(embedSpec, JSON.parse(categoryDomainKey) as ChartCategoryDomains),
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [embedSpec, categoryDomainKey, theme],
  );
  const [zoomActive, setZoomActive] = useState(false);
  const [linkable, setLinkable] = useState(true);
  const [boxReady, setBoxReady] = useState(false);
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
    void view
      .runAsync()
      .finally(finishRefresh)
      .then(async () => {
        if (viewRef.current === view) await resizeRef.current?.(sizeRef.current);
      })
      .catch((error: unknown) => {
        if (viewRef.current === view) {
          setEmbedError(error instanceof Error ? error.message : String(error));
        }
      });
  }, [displayRows]);

  useEffect(() => {
    void resizeRef
      .current?.({ width: measuredWidth, height: chartHeight, fillHeight: fullscreen })
      .catch((error: unknown) => {
        setEmbedError(error instanceof Error ? error.message : String(error));
      });
  }, [measuredWidth, chartHeight, fullscreen]);

  // One embedded view per chart definition; rows and the selection only update it.
  const hasWidth = measuredWidth > 0;
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !categoricalSpec || !hasRows || !hasWidth) return;
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
    const seriesLegend = withSeriesLegend(
      categoricalSpec,
      embeddedRows ?? [],
      preset,
      entityField,
      colorField,
    );
    const initialSize = sizeRef.current;
    const prepared = withDefaultProjectionFit(
      prepareChartSpec(seriesLegend.spec, {
        height: initialSize.height,
        rows: cloneRows(embeddedRows ?? []),
        // Defaults put legends below the plot; only authored side legends
        // consume horizontal space in a narrow docked viewer.
        width: Math.max(220, initialSize.width - chartSideLegendSpace(seriesLegend.spec)),
      }),
      embeddedRows ?? [],
    );
    embedChart(node, prepared, { renderer })
      .then(async (result) => {
        if (cancelled) {
          result.finalize();
          return;
        }
        finalize = result.finalize;
        const view = result.view;
        setEmbedError('');
        viewRef.current = view;
        let resizeGeneration = 0;
        const resize = (size: ChartSize) => {
          const generation = ++resizeGeneration;
          return resizeChartView(
            view,
            result.vgSpec,
            {
              ...size,
              width: Math.max(
                220,
                size.width - (result.vgSpec.layout ? 0 : chartSideLegendSpace(seriesLegend.spec)),
              ),
            },
            () => cancelled || generation !== resizeGeneration,
          );
        };
        resizeRef.current = resize;
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
        await resize(sizeRef.current);
        if (cancelled) return;
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
              const markValues =
                wholeCurveBrushRef.current && entityField && selectionField
                  ? translateChartSelectionValues(
                      rowsRef.current ?? [],
                      entityField,
                      selectionField,
                      translateChartSelectionValues(
                        rowsRef.current ?? [],
                        selectionField,
                        entityField,
                        values,
                      ),
                    )
                  : values;
              const previous =
                additiveBrushRef.current && selectionRef.current?.field === selectionField
                  ? selectionRef.current.values
                  : [];
              const merged = additiveBrushRef.current
                ? [...new Set([...previous, ...markValues])]
                : markValues;
              void bindingRef.current?.select(merged);
              setSelectionRef.current?.({
                field: selectionField,
                source: componentId,
                values: merged,
              });
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
              rowsRef.current ?? [],
              markSelectionField,
              selectionField,
              state.values,
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
            const hit =
              plot && xField && yField && entityField
                ? nearestChartSeriesValue(
                    view,
                    rowsRef.current ?? [],
                    { x: event.clientX - plot.left, y: event.clientY - plot.top },
                    xField,
                    yField,
                    entityField,
                    xAxisType,
                    selectionField,
                  )
                : undefined;
            const fallback = chartMarkSelectionValue(item, markSelectionField);
            if (!hit && fallback === undefined) return;
            const wholeCurve = Boolean(event.ctrlKey || event.metaKey || hit?.kind === 'line');
            const targets =
              wholeCurve && hit && entityField
                ? translateChartSelectionValues(
                    rowsRef.current ?? [],
                    entityField,
                    selectionField,
                    [hit.series],
                  )
                : hit?.point !== undefined
                  ? [hit.point]
                  : fallback !== undefined
                    ? [fallback]
                    : [];
            if (!targets.length) return;
            const current = selectionRef.current;
            const previous = current?.field === selectionField ? current.values : [];
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
              rowsRef.current ?? [],
              selectionField,
              markSelectionField,
              current.values,
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
      resizeRef.current = undefined;
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
    containerRef,
    colorField,
    preset,
    componentId,
    theme,
    categoricalSpec,
    entityField,
    fullscreen,
    hasRows,
    hasWidth,
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
          rowsRef.current ?? [],
          selectionField,
          markSelectionField,
          selectionState.values,
        ),
      });
    }
  }, [markSelectionField, selectionField, selectionState]);

  return {
    viewRef,
    bindingRef,
    embedError,
    setEmbedError,
    zoomActive,
    setZoomActive,
    linkable,
    boxReady,
    setBoxReady,
  };
}
