import { ChartLineIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { View } from 'vega';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { chartQueryColumns, useChartRows, type ChartDataQuery, type ChartRow } from './chart-data';
import {
  canvasAvailable,
  embedChart,
  isSingleViewSpec,
  prepareChartSpec,
  type ChartRenderer,
} from './chart-embed';
import { ChartPresetError, renderChartPreset } from './chart-presets';
import { bindChartSelection, viewHasSignal, type ChartSelectionBinding } from './chart-selection';
import { CHART_SPEC_RULES, checkChartSpec, describeChartSpecViolations } from './chart-spec-guard';
import { parseSelectionState, type SelectionWriter } from './selection-state';

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

type BuiltSpec =
  | { spec: Record<string, unknown>; error?: undefined }
  | { spec?: undefined; error: string };

type ChartDefinition = Pick<
  ClioChartProps,
  'spec' | 'preset' | 'xField' | 'yField' | 'entityField' | 'colorField' | 'facetField' | 'xType'
>;

function buildSpec(definition: ChartDefinition, param: string): BuiltSpec {
  const { preset, spec, ...fields } = definition;
  if (preset) {
    try {
      return { spec: renderChartPreset(preset, { ...fields, selectionParam: param }) };
    } catch (error) {
      if (error instanceof ChartPresetError) return { error: error.message };
      throw error;
    }
  }
  if (!spec) return { error: 'the chart names neither a preset nor a spec.' };
  const violations = checkChartSpec(spec);
  if (violations.length) {
    return {
      error: `the spec breaks the chart rules: ${describeChartSpecViolations(violations)}.`,
    };
  }
  return { spec };
}

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

/** A Vega-Lite chart over inline or artifact rows, with a selection linkable across components. */
export function ClioChart(props: ClioChartProps) {
  const {
    accessibility,
    componentId,
    height = DEFAULT_CHART_HEIGHT,
    selection,
    title,
    weight,
  } = props;
  const { colorField, entityField, facetField, preset, xField, xType, yField } = props;
  const param = props.selectionParam ?? CHART_SPEC_RULES.defaultSelectionParam;
  const selectionField = props.selectionField ?? entityField;
  // The binder hands a static `spec` over by reference, so this rebuilds only when it changes.
  const rawSpec = props.spec;
  const built = useMemo(
    () =>
      buildSpec(
        { colorField, entityField, facetField, preset, spec: rawSpec, xField, xType, yField },
        param,
      ),
    [colorField, entityField, facetField, param, preset, rawSpec, xField, xType, yField],
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
      ]),
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
  const {
    rows,
    loading,
    error: dataError,
    note,
  } = useChartRows({
    columns,
    data: props.data,
    dataQuery: props.dataQuery,
    dataUri: props.dataUri,
  });
  const selectionState = useMemo(() => parseSelectionState(selection), [selection]);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | undefined>(undefined);
  const bindingRef = useRef<ChartSelectionBinding | undefined>(undefined);
  const rowsRef = useRef(rows);
  const selectionRef = useRef(selectionState);
  const setSelectionRef = useRef(props.setSelection);
  const [embedError, setEmbedError] = useState('');
  const [linkable, setLinkable] = useState(true);
  const renderer = useMemo<ChartRenderer>(() => (canvasAvailable() ? 'canvas' : 'svg'), []);
  const spec = built.spec;
  const hasRows = rows !== undefined;
  const singleView = spec ? isSingleViewSpec(spec) : false;

  useEffect(() => {
    setSelectionRef.current = props.setSelection;
  }, [props.setSelection]);
  useEffect(() => {
    rowsRef.current = rows;
    const view = viewRef.current;
    if (!view || !rows) return;
    view.data('source', cloneRows(rows));
    void view.runAsync();
  }, [rows]);

  // One embedded view per chart definition; rows and the selection only update it.
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !spec || !hasRows) return;
    let cancelled = false;
    let finalize: (() => void) | undefined;
    setEmbedError('');
    const prepared = prepareChartSpec(spec, {
      height,
      rows: cloneRows(rowsRef.current ?? []),
      width: node.clientWidth || undefined,
    });
    embedChart(node, prepared, { dark: isDarkTheme(), renderer })
      .then(async (result) => {
        if (cancelled) {
          result.finalize();
          return;
        }
        finalize = result.finalize;
        const view = result.view;
        viewRef.current = view;
        const canLink = viewHasSignal(view, param);
        setLinkable(canLink);
        if (!canLink) return;
        const binding = bindChartSelection(view, {
          componentId,
          param,
          field: selectionField,
          write: (state) => setSelectionRef.current?.(state),
        });
        bindingRef.current = binding;
        const current = selectionRef.current;
        if (current) await binding.apply(current);
      })
      .catch((error: unknown) => {
        if (!cancelled) setEmbedError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
      bindingRef.current?.dispose();
      bindingRef.current = undefined;
      viewRef.current = undefined;
      finalize?.();
    };
  }, [componentId, hasRows, height, param, renderer, selectionField, spec]);

  // A selection written by another component on this surface shows here.
  useEffect(() => {
    selectionRef.current = selectionState;
    if (selectionState) void bindingRef.current?.apply(selectionState);
  }, [selectionState]);

  const failure = built.error || dataError || embedError;

  // A single plot follows the panel's width (re-attached when the plot area reappears).
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !singleView || typeof ResizeObserver === 'undefined') return;
    let lastWidth = node.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = node.clientWidth;
      const view = viewRef.current;
      if (!view || !width || width === lastWidth) return;
      lastWidth = width;
      view.width(width);
      void view.runAsync();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [failure, hasRows, singleView]);

  const heading = title || 'Chart';
  const description = describeChart(spec, rows, loading, note);
  const label = a2uiAccessibilityLabel(accessibility) ?? `${heading} chart`;

  return (
    <div
      className="min-w-0"
      data-slot="a2ui-chart"
      style={typeof weight === 'number' ? { flex: `${weight}`, minHeight: 0 } : undefined}
    >
      <Frame {...a2uiAccessibilityProps(accessibility)} aria-label={label} dense role="group">
        <FrameHeader className="flex-row items-center gap-2">
          <ChartLineIcon aria-hidden="true" className="size-4 text-primary" />
          <div className="min-w-0 flex-1">
            <FrameTitle className="truncate">{heading}</FrameTitle>
            <FrameDescription>{description}</FrameDescription>
          </div>
        </FrameHeader>
        <FramePanel className="p-0">
          {failure ? (
            <p className="p-4 text-sm text-destructive">Chart unavailable: {failure}</p>
          ) : (
            <div
              aria-label={`${heading}: ${description}`}
              className="relative min-w-0 overflow-x-auto"
              role="img"
              style={{ minHeight: height }}
            >
              {!hasRows || !spec ? (
                <div className="absolute inset-0 animate-pulse bg-muted motion-reduce:animate-none" />
              ) : null}
              {/* Vega owns this node's children; React never renders into it. */}
              <div data-renderer={renderer} data-slot="a2ui-chart-view" ref={containerRef} />
            </div>
          )}
          {!failure && note ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">{note}</p>
          ) : null}
          {!failure && !linkable && selection !== undefined ? (
            <p className="border-t px-3 py-2 text-xs text-muted-foreground">
              This chart has no “{param}” selection, so it neither follows nor shares the linked
              selection.
            </p>
          ) : null}
        </FramePanel>
      </Frame>
    </div>
  );
}

/** Vega stamps its own id onto each tuple, so it gets copies, never the data model's rows. */
function cloneRows(rows: readonly ChartRow[]): ChartRow[] {
  return rows.map((row) => ({ ...row }));
}

function describeChart(
  spec: Record<string, unknown> | undefined,
  rows: readonly ChartRow[] | undefined,
  loading: boolean,
  note: string,
): string {
  if (loading) return 'Loading rows…';
  const summary = spec && typeof spec.description === 'string' ? spec.description : '';
  const count = rows ? `${rows.length.toLocaleString()} rows` : '';
  return [summary, count].filter(Boolean).join(' · ') || (note ? note : 'No rows');
}
