import { ChartLineIcon } from 'lucide-react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useContainerQuery } from '@/hooks/use-container-query';
import type { View } from 'vega';
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  canvasAvailable,
  embedChart,
  isSingleViewSpec,
  prepareChartSpec,
  type ChartRenderer,
} from './chart-embed';
import { ChartPresetError, renderChartPreset } from './chart-presets';
import { withDefaultProjectionFit } from './chart-projection-fit';
import { bindChartSelection, viewHasSignal, type ChartSelectionBinding } from './chart-selection';
import { CHART_SPEC_RULES, checkChartSpec, describeChartSpecViolations } from './chart-spec-guard';
import {
  bindChartZoom,
  withZoomBrush,
  zoomRangeFilterValue,
  type ChartZoomBinding,
  type ChartZoomRange,
} from './chart-zoom';
import { DataFilterPopover, type DataFilterField } from './data-filter-popover';
import { DATA_HEADER_LABEL_MIN_WIDTH, DataHeaderCompactContext } from './data-header-density';
import { DataReferenceThisButton } from './data-reference-this-button';
import { dataViewFlexStyle } from './data-view-layout';
import type { ClioColumnFilterValue } from './data-table-column-filter';
import {
  columnKindFromRows,
  columnKindFromSchema,
  describeQueryFilter,
  mergeFilters,
} from './data-query-filters';
import { buildZoneReference, type DataZoneReference } from './data-zone-reference';
import {
  isSelectionValue,
  parseSelectionState,
  selectionKey,
  type SelectionValue,
  type SelectionWriter,
} from './selection-state';

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

/**
 * Every distinct value `field` takes across `rows`, or `[]` past
 * `MAX_KEYBOARD_SELECTABLE_CANDIDATES` — see `selectionCandidates` in
 * `ClioChart` for why a keyboard-select control omits itself past that cap
 * rather than rendering an unbounded, unvirtualized option list.
 */
function distinctFieldValues(
  rows: readonly ChartRow[] | undefined,
  field: string | undefined,
): SelectionValue[] {
  if (!field || !rows) return [];
  const seen = new Set<SelectionValue>();
  for (const row of rows) {
    const raw = row[field];
    if (isSelectionValue(raw)) seen.add(raw);
  }
  return seen.size > MAX_KEYBOARD_SELECTABLE_CANDIDATES ? [] : [...seen];
}

/** Default plot height when the producer names none. Unit: CSS pixels. */
const DEFAULT_CHART_HEIGHT = 320;
/** See `selectionCandidates` below for why the keyboard-select control caps out here. */
const MAX_KEYBOARD_SELECTABLE_CANDIDATES = 200;

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
        {
          colorField,
          // The preset template's OWN selection param always selects by
          // whatever fills its `entityField` slot (`scatter.json` etc.:
          // `select.fields: ["{{entityField}}"]`) — it has no separate
          // `selectionField` slot to fill (that template is byte-pinned to
          // clio-schemas; a new slot is a cross-repo schema change, not a
          // client-only one). A declared `selectionField` other than
          // `entityField` must still drive what the CHART actually selects
          // by, or clicking a point would write the entity id under the
          // label of a field whose real values it never resolved — filling
          // this slot with `selectionField` (which already falls back to
          // `entityField`) makes the compiled spec select by the field the
          // producer actually asked to link on.
          entityField: selectionField,
          facetField,
          preset,
          spec: rawSpec,
          xField,
          xType,
          yField,
        },
        param,
      ),
    [colorField, facetField, param, preset, rawSpec, selectionField, xField, xType, yField],
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
  // This viewer's own per-column filters and brushed zoom range, both layered
  // onto — never replacing — the producer's `dataQuery.filter` (owner ruling,
  // #1533: the same server-side filter controls the table gets, plus
  // "zoom or brush re-queries at full detail").
  const [filters, setFilters] = useState<ReadonlyMap<string, ClioColumnFilterValue>>(new Map());
  const [zoomRange, setZoomRange] = useState<ChartZoomRange | undefined>(undefined);
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
    let zoomed: NonNullable<ChartDataQuery['filter']> = merged;
    if (zoomRange && xField) {
      const rangeEntry: NonNullable<ChartDataQuery['filter']>[number] = {
        column: xField,
        op: 'range',
        value: [
          zoomRangeFilterValue(zoomRange.min, xType),
          zoomRangeFilterValue(zoomRange.max, xType),
        ],
      };
      zoomed = [...merged, rangeEntry];
    }
    if (!zoomed.length) return props.dataQuery;
    return { ...props.dataQuery, filter: zoomed };
  }, [filters, props.dataQuery, xField, xType, zoomRange]);
  const {
    rows,
    loading,
    error: dataError,
    matchedRows,
    note,
    schema,
  } = useChartRows({
    columns,
    data: props.data,
    dataQuery: effectiveDataQuery,
    dataUri: props.dataUri,
  });
  const selectionState = useMemo(() => parseSelectionState(selection), [selection]);

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<View | undefined>(undefined);
  const bindingRef = useRef<ChartSelectionBinding | undefined>(undefined);
  const zoomBindingRef = useRef<ChartZoomBinding | undefined>(undefined);
  const rowsRef = useRef(rows);
  const selectionRef = useRef(selectionState);
  const setSelectionRef = useRef(props.setSelection);
  const [embedError, setEmbedError] = useState('');
  const [linkable, setLinkable] = useState(true);
  const renderer = useMemo<ChartRenderer>(() => (canvasAvailable() ? 'canvas' : 'svg'), []);
  const spec = built.spec;
  const hasRows = rows !== undefined;
  const singleView = spec ? isSingleViewSpec(spec) : false;
  // Only a `dataUri` chart can re-query, so only it gets the brush/zoom param.
  const zoomInjection = useMemo(
    () =>
      spec && props.dataUri && singleView
        ? withZoomBrush(spec, { pointParam: param, xField })
        : { spec },
    [param, props.dataUri, singleView, spec, xField],
  );
  const embedSpec = zoomInjection.spec;
  const zoomParam = zoomInjection.param;
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
  // choosing one of `selectionField`'s own distinct values does. Capped, and
  // omitted past the cap, for the same reason the map's own point list now
  // virtualizes instead of rendering one control per row (MEDIUM 6) — a
  // flat, unvirtualized list stops being a reasonable "keyboard access"
  // affordance once a field is closer to a unique row id than a category.
  const selectionCandidates = useMemo(
    () => distinctFieldValues(rows, selectionField),
    [rows, selectionField],
  );
  const selectedCandidate =
    selectionField && selectionState?.field === selectionField && selectionState.values.length === 1
      ? String(selectionState.values[0])
      : '';
  const handleSelectCandidate = (raw: string) => {
    const value = selectionCandidates.find((candidate) => String(candidate) === raw);
    if (value !== undefined) void bindingRef.current?.select([value]);
  };

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
    if (!node || !embedSpec || !hasRows) return;
    let cancelled = false;
    let finalize: (() => void) | undefined;
    setEmbedError('');
    // Snapshotted once, here — `rowsRef.current` can move on during the
    // `await embedChart(...)` gap below (a `[rows]` update arriving before
    // this promise settles). The `[rows]` effect above only pushes an update
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
        height,
        rows: cloneRows(embeddedRows ?? []),
        width: node.clientWidth || undefined,
      }),
      embeddedRows ?? [],
    );
    embedChart(node, prepared, { dark: isDarkTheme(), renderer })
      .then(async (result) => {
        if (cancelled) {
          result.finalize();
          return;
        }
        finalize = result.finalize;
        const view = result.view;
        viewRef.current = view;
        if (rowsRef.current && rowsRef.current !== embeddedRows) {
          view.data('source', cloneRows(rowsRef.current));
          await view.runAsync();
        }
        const canLink = viewHasSignal(view, param);
        setLinkable(canLink);
        if (zoomParam && xField && viewHasSignal(view, zoomParam)) {
          zoomBindingRef.current = bindChartZoom(view, {
            onRangeChange: setZoomRange,
            param: zoomParam,
            xField,
          });
        }
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
      zoomBindingRef.current?.dispose();
      zoomBindingRef.current = undefined;
      viewRef.current = undefined;
      finalize?.();
    };
  }, [componentId, embedSpec, hasRows, height, param, renderer, selectionField, xField, zoomParam]);

  // A selection written by another component on this surface shows here.
  useEffect(() => {
    selectionRef.current = selectionState;
    if (selectionState) void bindingRef.current?.apply(selectionState);
  }, [selectionState]);

  // Brushing an x range is a "zone" (#1533 item 4): once the re-query for
  // that range resolves, the zone's own selectionField values replace the
  // shared selection, so linked map/table views follow the brushed range -
  // not just this chart's own view of it.
  const zoneKeyRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!zoomRange || !selectionField || !rows) return;
    const values = rows.map((row) => row[selectionField]).filter(isSelectionValue);
    const key = selectionKey(selectionField, values);
    if (key === zoneKeyRef.current) return;
    zoneKeyRef.current = key;
    setSelectionRef.current?.({ field: selectionField, source: componentId, values });
  }, [componentId, rows, selectionField, zoomRange]);

  const clearZoom = () => {
    setZoomRange(undefined);
    zoneKeyRef.current = undefined;
    const view = viewRef.current;
    if (view && zoomParam) {
      view.signal(zoomParam, {});
      void view.runAsync();
    }
  };

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

  const frameRef = useRef<HTMLDivElement>(null);
  const roomyHeader = useContainerQuery(frameRef, DATA_HEADER_LABEL_MIN_WIDTH);
  const heading = title || 'Chart';
  const description = describeChart(spec, rows, loading, note);
  const label = a2uiAccessibilityLabel(accessibility) ?? `${heading} chart`;
  const buildReference = (): DataZoneReference => {
    const shownRows = (rows ?? []).length;
    const totalRows = matchedRows ?? shownRows;
    const zoneDescription = zoomRange
      ? `${shownRows.toLocaleString()} of ${totalRows.toLocaleString()} rows — ${xField} ${formatZoomBound(zoomRange.min, xType)}–${formatZoomBound(zoomRange.max, xType)}`
      : `the whole view (${totalRows.toLocaleString()} rows)`;
    return buildZoneReference({
      componentLabel: heading,
      datasetLabel: artifactIdFromDataUri(props.dataUri) ?? props.dataUri ?? 'inline data',
      filters: (effectiveDataQuery?.filter ?? []).map(describeQueryFilter),
      previewColumns: columns.slice(0, 5),
      previewRows: (rows ?? []).slice(0, 5),
      query: { dataQuery: effectiveDataQuery, dataUri: props.dataUri },
      zoneDescription: note ? `${zoneDescription} — ${note.replace(/\.$/u, '')}` : zoneDescription,
    });
  };

  return (
    <div
      className="min-w-0"
      data-slot="a2ui-chart"
      ref={frameRef}
      style={dataViewFlexStyle(weight)}
    >
      <Frame {...a2uiAccessibilityProps(accessibility)} aria-label={label} dense role="group">
        <DataHeaderCompactContext.Provider value={!roomyHeader}>
          <FrameHeader className="flex-row flex-wrap items-center gap-x-2 gap-y-1.5">
            <ChartLineIcon aria-hidden="true" className="size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <FrameTitle className="truncate">{heading}</FrameTitle>
              <FrameDescription className="truncate" title={description}>
                {description}
              </FrameDescription>
            </div>
            {props.dataUri && filterableFields.length ? (
              <DataFilterPopover
                fields={filterableFields}
                filters={filters}
                onFilterChange={handleFilterChange}
              />
            ) : null}
            {linkable && selectionField && selectionCandidates.length > 0 ? (
              <Select onValueChange={handleSelectCandidate} value={selectedCandidate}>
                <SelectTrigger
                  aria-label={`Select a ${selectionField} by keyboard`}
                  className="text-xs"
                  size="sm"
                >
                  <SelectValue placeholder={`Select ${selectionField}…`} />
                </SelectTrigger>
                <SelectContent>
                  {selectionCandidates.map((candidate) => (
                    <SelectItem key={String(candidate)} value={String(candidate)}>
                      {String(candidate)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            {zoomRange ? (
              <Button className="gap-1 text-xs" onClick={clearZoom} size="sm" variant="ghost">
                <CloseIcon aria-hidden="true" className="size-3.5" />
                Reset zoom
              </Button>
            ) : null}
            {props.dataUri && hasRows ? (
              <DataReferenceThisButton buildReference={buildReference} />
            ) : null}
          </FrameHeader>
        </DataHeaderCompactContext.Provider>
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
          {!failure && zoomRange ? (
            <p
              className="border-t px-3 py-2 text-xs text-muted-foreground"
              data-slot="a2ui-chart-zoom-caption"
            >
              Zoomed to {xField} {formatZoomBound(zoomRange.min, xType)}–
              {formatZoomBound(zoomRange.max, xType)}.
            </p>
          ) : null}
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

/** A brushed bound, reader-facing: a date for a temporal axis, else a short number. */
function formatZoomBound(bound: number, xType: string | undefined): string {
  if (xType === 'temporal') return new Date(bound).toLocaleDateString();
  return new Intl.NumberFormat(undefined, { maximumSignificantDigits: 4 }).format(bound);
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
