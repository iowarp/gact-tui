import { isSelectionValue } from './selection-state';
import type { ChartRow } from './chart-data';
import type { View } from 'vega';

/** Interval param added for a two-dimensional rectangular chart selection. */
export function chartBoxSelectionParamName(pointParam: string): string {
  return `${pointParam}_box`;
}

/** Interval param bound to the chart scales for user-driven zoom and pan. */
export function chartZoomParamName(pointParam: string): string {
  return `${pointParam}_zoom`;
}

/** Clear a Vega-Lite scale-bound interval so its scales return to their domains. */
export function clearManualChartZoom(view: Pick<View, 'data' | 'runAsync'>, param: string): void {
  view.data(`${param}_store`, []);
  void view.runAsync();
}

/** Set a scale-bound interval from the rows selected in another linked view. */
export async function zoomChartToRows(
  view: Pick<View, 'data' | 'runAsync' | 'signal'>,
  param: string,
  rows: readonly ChartRow[],
  xField: string,
  yField: string,
  xType: ChartAxisType,
  yType: ChartAxisType,
): Promise<boolean> {
  const domain = (field: string, type: ChartAxisType): [number, number] | undefined => {
    const values = rows
      .map((row) => comparable(row[field], type))
      .filter((value): value is number => typeof value === 'number');
    if (!values.length) return undefined;
    const low = Math.min(...values);
    const high = Math.max(...values);
    const padding = low === high ? Math.max(Math.abs(low) * 0.05, type === 'temporal' ? 3_600_000 : 1) : (high - low) * 0.06;
    return [low - padding, high + padding];
  };
  const x = domain(xField, xType);
  const y = domain(yField, yType);
  if (!x || !y) return false;
  const fields = view.signal(`${param}_tuple_fields`);
  if (!Array.isArray(fields) || fields.length !== 2) return false;
  view.data(`${param}_store`, [{ unit: '', fields, values: [x, y] }]);
  await view.runAsync();
  return true;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const NESTED_LIST_KEYS = ['layer', 'concat', 'hconcat', 'vconcat'] as const;

function withOneUnitParam(
  spec: Record<string, unknown>,
  param: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of NESTED_LIST_KEYS) {
    const list = spec[key];
    if (Array.isArray(list) && list.length > 0 && isJsonObject(list[0])) {
      const children = list as Record<string, unknown>[];
      // Vega-Lite expands a composite mark (boxplot/errorbar/errorband) into
      // several internal layers. An interval param on that composite is then
      // copied to each layer, producing duplicate signal names. Attach it to
      // the first ordinary layer (the boxplot preset's points) instead.
      const ordinaryIndex = children.findIndex((child) => {
        const mark = child.mark;
        const type = typeof mark === 'string' ? mark : isJsonObject(mark) ? mark.type : undefined;
        return !['boxplot', 'errorbar', 'errorband'].includes(String(type));
      });
      const index = ordinaryIndex >= 0 ? ordinaryIndex : 0;
      return { ...spec, [key]: children.map((child, position) => position === index ? withOneUnitParam(child, param) : child) };
    }
  }
  if (('facet' in spec || 'repeat' in spec) && isJsonObject(spec.spec)) {
    return { ...spec, spec: withOneUnitParam(spec.spec, param) };
  }
  const existing = Array.isArray(spec.params) ? spec.params : [];
  if (existing.some((entry) => isJsonObject(entry) && entry.name === param.name)) return spec;
  return { ...spec, params: [...existing, param] };
}

function withRootParam(
  spec: Record<string, unknown>,
  param: Record<string, unknown>,
): Record<string, unknown> {
  const existing = Array.isArray(spec.params) ? spec.params : [];
  if (existing.some((entry) => isJsonObject(entry) && entry.name === param.name)) return spec;
  return { ...spec, params: [...existing, param] };
}

/** Give a custom Vega-Lite chart the same point selection as the presets. */
export function withChartPointSelection(
  spec: Record<string, unknown>,
  param: string,
  field: string | undefined,
): Record<string, unknown> {
  if (!field) return spec;
  const hasParam = (node: Record<string, unknown>): boolean => {
    if (Array.isArray(node.params) && node.params.some((entry) => isJsonObject(entry) && entry.name === param)) return true;
    for (const key of NESTED_LIST_KEYS) {
      const children = node[key];
      if (Array.isArray(children) && children.some((child) => isJsonObject(child) && hasParam(child))) return true;
    }
    return isJsonObject(node.spec) && hasParam(node.spec);
  };
  if (hasParam(spec)) return spec;
  return withOneUnitParam(spec, {
    name: param,
    select: { clear: 'dblclick', fields: [field], on: 'click', toggle: 'event.shiftKey', type: 'point' },
  });
}

/** Add a 2D interval brush to the first plot unit without changing its scales. */
export function withChartBoxSelection(
  spec: Record<string, unknown>,
  {
    pointParam,
    xField,
    yField,
    active = false,
  }: { pointParam: string; xField: string | undefined; yField: string | undefined; active?: boolean },
): { spec: Record<string, unknown>; param?: string } {
  if (!xField || !yField) return { param: undefined, spec };
  const param = chartBoxSelectionParamName(pointParam);
  return {
    param,
    spec: withOneUnitParam(spec, {
      name: param,
      select: {
        clear: 'dblclick',
        encodings: ['x', 'y'],
        on: active
          ? '[pointerdown[!event.altKey], window:pointerup] > window:pointermove!'
          : '[pointerdown[event.shiftKey], window:pointerup] > window:pointermove!',
        type: 'interval',
      },
    }),
  };
}

/** Add separately gesture-bound interval zoom and pan to the chart scales. */
export function withManualChartZoom(
  spec: Record<string, unknown>,
  {
    pointParam,
    xField,
    yField,
  }: { pointParam: string; xField: string | undefined; yField: string | undefined },
): { spec: Record<string, unknown>; param?: string } {
  if (!xField || !yField) return { spec };
  const param = chartZoomParamName(pointParam);
  return {
    param,
    // Scale-bound intervals belong to the view that owns the scales. A param
    // inside the first layer has no access to the parent view's x/y scales.
    spec: withRootParam(spec, {
      bind: 'scales',
      name: param,
      select: {
        clear: 'dblclick',
        encodings: ['x', 'y'],
        translate: '[pointerdown[event.altKey && !event.shiftKey], window:pointerup] > window:pointermove!',
        type: 'interval',
        zoom: 'wheel![event.ctrlKey]',
      },
    }),
  };
}

export type ChartAxisType = 'quantitative' | 'temporal' | 'nominal' | 'ordinal' | undefined;

interface AxisRange {
  numeric?: [number, number];
  categories?: ReadonlySet<string>;
}

function comparable(raw: unknown, type: ChartAxisType): number | string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (type === 'temporal') {
    const value =
      raw instanceof Date
        ? raw.getTime()
        : typeof raw === 'number'
          ? raw
          : Date.parse(String(raw));
    return Number.isFinite(value) ? value : undefined;
  }
  if (type === 'quantitative' || typeof raw === 'number') {
    const value = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(value) ? value : undefined;
  }
  return String(raw);
}

function axisRange(
  raw: unknown,
  field: string,
  type: ChartAxisType,
  rows: readonly ChartRow[],
): AxisRange | undefined {
  if (!isJsonObject(raw) || !Array.isArray(raw[field]) || raw[field].length === 0) return undefined;
  const selected = raw[field] as unknown[];
  // Vega returns every covered category for ordinal/nominal intervals, not
  // two endpoints. Using only the first and last would drop middle cells (or
  // reject the brush entirely once it covers three or more categories).
  if (type === 'ordinal' || type === 'nominal') {
    return { categories: new Set(selected.map((value) => String(value))) };
  }
  if (selected.length !== 2) return undefined;
  const bounds = selected as [unknown, unknown];
  const first = comparable(bounds[0], type);
  const second = comparable(bounds[1], type);
  if (first === undefined || second === undefined) return undefined;
  if (typeof first === 'number' && typeof second === 'number') {
    return { numeric: first <= second ? [first, second] : [second, first] };
  }

  const categories = [...new Set(rows.map((row) => comparable(row[field], type)).filter(
    (value): value is string => typeof value === 'string',
  ))];
  const start = categories.indexOf(String(first));
  const end = categories.indexOf(String(second));
  if (start < 0 || end < 0) return undefined;
  return { categories: new Set(categories.slice(Math.min(start, end), Math.max(start, end) + 1)) };
}

function includes(range: AxisRange, raw: unknown, type: ChartAxisType, rows: readonly ChartRow[], field: string): boolean {
  const value = comparable(raw, type);
  if (value === undefined) return false;
  if (range.numeric) {
    return typeof value === 'number' && value >= range.numeric[0] && value <= range.numeric[1];
  }
  if (range.categories) {
    // Keep `rows` in the signature so the axis range and row values are always
    // interpreted against the same rendered dataset after a data refresh.
    void rows;
    void field;
    return typeof value === 'string' && range.categories.has(value);
  }
  return false;
}

/** Extract linked row ids covered by a Vega-Lite x/y interval signal. */
export function chartBoxSelectionValues(
  signal: unknown,
  {
    rows,
    selectionField,
    xField,
    xType,
    yField,
    yType,
  }: {
    rows: readonly ChartRow[];
    selectionField: string;
    xField: string;
    xType: ChartAxisType;
    yField: string;
    yType: ChartAxisType;
  },
): Array<string | number> {
  const xRange = axisRange(signal, xField, xType, rows);
  const yRange = axisRange(signal, yField, yType, rows);
  if (!xRange || !yRange) return [];
  const values = new Set<string | number>();
  for (const row of rows) {
    if (
      includes(xRange, row[xField], xType, rows, xField) &&
      includes(yRange, row[yField], yType, rows, yField) &&
      isSelectionValue(row[selectionField])
    ) {
      values.add(row[selectionField]);
    }
  }
  return [...values];
}

type BoxSignalListener = (_name: string, signal: unknown) => void;

interface BoxSelectableView {
  addSignalListener: (name: string, listener: BoxSignalListener) => void;
  removeSignalListener: (name: string, listener: BoxSignalListener) => void;
}

/** Debounce box gestures and report their matching values, including an empty clear. */
export function bindChartBoxSelection(
  view: BoxSelectableView,
  {
    param,
    read,
    write,
    shouldIgnoreSignal,
    debounceMs = 120,
  }: {
    param: string;
    read: (signal: unknown) => Array<string | number>;
    write: (values: Array<string | number>) => void;
    shouldIgnoreSignal?: () => boolean;
    debounceMs?: number;
  },
): { dispose: () => void } {
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let latest: Array<string | number> = [];
  const listener = (_name: string, signal: unknown) => {
    if (disposed || shouldIgnoreSignal?.()) return;
    if (timer !== undefined) clearTimeout(timer);
    latest = read(signal);
    timer = setTimeout(() => {
      timer = undefined;
      if (!disposed) write(latest);
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
