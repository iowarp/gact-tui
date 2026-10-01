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

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Composition keys whose FIRST sub-view is where a brush attaches (see `withOneUnitParam`). */
const NESTED_LIST_KEYS = ['layer', 'concat', 'hconcat', 'vconcat'] as const;

/**
 * Attaches `param` to exactly ONE leaf unit spec, recursing into the FIRST
 * sub-view of any composition (`layer`/`concat`/`hconcat`/`vconcat`, or a
 * `facet`/`repeat` operator's own `spec`) instead of the composition's own
 * top level (G0 rule 4 / G3: "attach the brush to exactly one unit"). A
 * `params` entry at the top of a LAYERED spec is pushed into EVERY layer
 * unit by the Vega-Lite compiler, which then re-registers the same-named
 * signal once per unit ("Duplicate signal name" — the G3 box-plot bug);
 * `chart-embed.ts`'s `isSingleViewSpec` correctly treats `layer` as one
 * visual plot (full width, one gesture), but a top-level `params` entry is
 * still wrong for it. A no-op (returns `spec` unchanged) once the target
 * leaf already defines a param of this name (a hand-authored spec that
 * already brushes on its own).
 */
function withOneUnitParam(
  spec: Record<string, unknown>,
  param: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of NESTED_LIST_KEYS) {
    const list = spec[key];
    if (Array.isArray(list) && list.length > 0 && isJsonObject(list[0])) {
      const [first, ...rest] = list as Record<string, unknown>[];
      return { ...spec, [key]: [withOneUnitParam(first, param), ...rest] };
    }
  }
  if (('facet' in spec || 'repeat' in spec) && isJsonObject(spec.spec)) {
    return { ...spec, spec: withOneUnitParam(spec.spec, param) };
  }
  const existingParams = Array.isArray(spec.params) ? spec.params : [];
  if (existingParams.some((entry) => isJsonObject(entry) && entry.name === param.name)) return spec;
  return { ...spec, params: [...existingParams, param] };
}

/**
 * Returns `spec` unchanged (and no param) when zoom/brush does not apply:
 * `xField` is required (the interval only ever spans the x encoding). Safe
 * on every composition shape (layered, faceted, concatenated) — see
 * `withOneUnitParam` for where the param actually lands.
 */
export function withZoomBrush(
  spec: Record<string, unknown>,
  { pointParam, xField }: { pointParam: string; xField: string | undefined },
): ChartZoomInjection {
  if (!xField) return { spec };
  const param = zoomBrushParamName(pointParam);
  const paramDef = { name: param, select: { encodings: ['x'], type: 'interval' } };
  return { param, spec: withOneUnitParam(spec, paramDef) };
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
