import type { View } from 'vega';

/**
 * Adds an x-only interval ("brush") selection to a chart, so a `dataUri`
 * chart can be zoomed or brushed to re-query its x range at full detail
 * (#1533 owner ruling: "Zoom or brush re-queries at full detail... Reduced
 * views say 'N of M'").
 *
 * The chart's own selection param (`clio.chart.v1`'s `selectionParam`, a
 * click-to-select-entity `type: "point"` selection) comes from a preset
 * template that is byte-pinned to clio-schemas
 * (`chart-assets/presets/*.json`) — it cannot be touched here. This adds a
 * SECOND, independent param to the already guard-checked spec object, purely
 * as gact-tui's own rendering behavior, the same way `prepareChartSpec`
 * already injects `data`/`width`/`height` downstream of `checkChartSpec`
 * (`chart-embed.ts`). Vega-Lite compiles an x-only interval selection with
 * drag-to-brush AND scroll-to-zoom for free (confirmed against the installed
 * vega-lite: the compiled signal set includes `<param>_translate_*` and
 * `<param>_zoom_*`, the same machinery `bind: "scales"` uses) — one
 * mechanism covers both gestures the ruling names.
 */

/** The interval-selection param name this module adds, distinct from the producer's own point-selection param. */
export function zoomBrushParamName(pointParam: string): string {
  return `${pointParam}_zoom`;
}

export interface ChartZoomInjection {
  spec: Record<string, unknown> | undefined;
  /** Absent when zoom/brush does not apply (no `xField`) — see `withZoomBrush`. */
  param?: string;
}

/**
 * Returns `spec` unchanged (and no param) when zoom/brush does not apply:
 * `xField` is required (the interval only ever spans the x encoding), and a
 * `type: "interval"` param already present under that name is left alone
 * (a hand-authored spec that already brushes on its own).
 */
export function withZoomBrush(
  spec: Record<string, unknown>,
  { pointParam, xField }: { pointParam: string; xField: string | undefined },
): ChartZoomInjection {
  if (!xField) return { spec };
  const param = zoomBrushParamName(pointParam);
  const existingParams = Array.isArray(spec.params) ? spec.params : [];
  if (existingParams.some((entry) => isJsonObject(entry) && entry.name === param)) {
    return { param, spec };
  }
  return {
    param,
    spec: {
      ...spec,
      params: [...existingParams, { name: param, select: { encodings: ['x'], type: 'interval' } }],
    },
  };
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface ChartZoomRange {
  min: number;
  max: number;
}

/**
 * The brushed x range from the interval selection's resolved signal, keyed
 * by the DATA FIELD name (confirmed against the installed vega-lite: an
 * `encodings: ["x"]` interval selection resolves as `{<xField>: [min, max]}`
 * in data units, already inverted through the chart's own x scale — not
 * `{x: [...]}` and not pixel space). `undefined` when the brush is empty
 * (a cleared interval resolves to `{}`) or the field is missing/malformed.
 */
export function zoomRangeFromSignal(resolved: unknown, xField: string): ChartZoomRange | undefined {
  if (!isJsonObject(resolved)) return undefined;
  const raw = resolved[xField];
  if (!Array.isArray(raw) || raw.length !== 2) return undefined;
  const [rawMin, rawMax] = raw as [unknown, unknown];
  const min = toFiniteMillisOrNumber(rawMin);
  const max = toFiniteMillisOrNumber(rawMax);
  if (min === undefined || max === undefined) return undefined;
  return min <= max ? { max, min } : { max: min, min: max };
}

function toFiniteMillisOrNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (value instanceof Date) return value.getTime();
  return undefined;
}

/** A range's bound as a `range` filter's scalar: an ISO string for a temporal field, else the raw number. */
export function zoomRangeFilterValue(bound: number, xType: string | undefined): string | number {
  return xType === 'temporal' ? new Date(bound).toISOString() : bound;
}

export const CHART_ZOOM_DEBOUNCE_MS = 300;

export interface ChartZoomBinding {
  dispose: () => void;
}

type ZoomableView = Pick<View, 'addSignalListener' | 'removeSignalListener'>;

/**
 * Debounced listener on the injected interval param: reports the brushed
 * range (or `undefined` once cleared) after the user pauses dragging/zooming,
 * so a re-query fires once per gesture rather than once per animation frame.
 */
export function bindChartZoom(
  view: ZoomableView,
  {
    debounceMs = CHART_ZOOM_DEBOUNCE_MS,
    onRangeChange,
    param,
    xField,
  }: {
    param: string;
    xField: string;
    onRangeChange: (range: ChartZoomRange | undefined) => void;
    debounceMs?: number;
  },
): ChartZoomBinding {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listener = (_name: string, resolved: unknown) => {
    if (disposed) return;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      if (!disposed) onRangeChange(zoomRangeFromSignal(resolved, xField));
    }, debounceMs);
  };
  view.addSignalListener(param, listener);
  return {
    dispose: () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      view.removeSignalListener(param, listener);
    },
  };
}
