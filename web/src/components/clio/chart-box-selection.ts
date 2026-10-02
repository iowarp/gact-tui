import { isSelectionValue } from './selection-state';
import type { SelectionValue } from './selection-state';
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
  const withToggle = (node: Record<string, unknown>): { node: Record<string, unknown>; found: boolean } => {
    let found = false;
    const next: Record<string, unknown> = { ...node };
    if (Array.isArray(node.params)) {
      next.params = node.params.map((entry) => {
        if (!isJsonObject(entry) || entry.name !== param || !isJsonObject(entry.select)) return entry;
        found = true;
        return { ...entry, select: { ...entry.select, toggle: entry.select.toggle ?? 'event.shiftKey' } };
      });
    }
    for (const key of NESTED_LIST_KEYS) {
      const children = node[key];
      if (Array.isArray(children)) {
        next[key] = children.map((child) => {
          if (!isJsonObject(child)) return child;
          const result = withToggle(child);
          found ||= result.found;
          return result.node;
        });
      }
    }
    if (isJsonObject(node.spec)) {
      const result = withToggle(node.spec);
      found ||= result.found;
      next.spec = result.node;
    }
    return { node: next, found };
  };
  const existing = withToggle(spec);
  if (existing.found) return existing.node;
  return withOneUnitParam(spec, {
    name: param,
    select: { clear: 'dblclick', fields: [field], on: 'click', toggle: 'event.shiftKey', type: 'point' },
  });
}

/** Give line and spectra points a forgiving click target while preserving their geometry. */
export function withChartLinePointTargets(spec: Record<string, unknown>): Record<string, unknown> {
  const mark = spec.mark;
  if (!isJsonObject(mark) || mark.type !== 'line' || mark.point !== true) return spec;
  return { ...spec, mark: { ...mark, point: { filled: true, size: 100 } } };
}

/** Resolve a series key from a Vega line or point scenegraph item. */
export function chartMarkSelectionValue(item: unknown, field: string): SelectionValue | undefined {
  const visited = new Set<object>();
  const find = (value: unknown, depth: number): SelectionValue | undefined => {
    if (depth > 5 || !value || typeof value !== 'object' || visited.has(value)) return undefined;
    visited.add(value);
    if (Array.isArray(value)) {
      for (const entry of value) {
        const found = find(entry, depth + 1);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    const record = value as Record<string, unknown>;
    if (isSelectionValue(record[field])) return record[field];
    for (const key of ['datum', 'values', 'items']) {
      const found = find(record[key], depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  };
  return find(item, 0);
}

/** Hit the plotted coordinates directly; Vega's line item can report the wrong series. */
export function nearestChartSeriesValue(
  view: Pick<View, 'origin' | 'scale'>,
  rows: readonly ChartRow[],
  cursor: { x: number; y: number },
  xField: string,
  yField: string,
  seriesField: string,
  xType: ChartAxisType,
): SelectionValue | undefined {
  try {
    const [originX, originY] = view.origin();
    const xScale = view.scale('x') as (value: unknown) => number;
    const yScale = view.scale('y') as (value: unknown) => number;
    const targetX = cursor.x - originX;
    const targetY = cursor.y - originY;
    let nearest = 12;
    let value: SelectionValue | undefined;
    const bySeries = new Map<SelectionValue, Array<{ x: number; y: number }>>();
    for (const row of rows) {
      const series = row[seriesField];
      if (!isSelectionValue(series)) continue;
      const rawX = row[xField];
      const xInput = xType === 'temporal' && typeof rawX === 'string' ? new Date(rawX) : rawX;
      const x = xScale(xInput);
      const y = yScale(row[yField]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const point = { x, y };
      const group = bySeries.get(series) ?? [];
      group.push(point);
      bySeries.set(series, group);
      const distance = Math.hypot(x - targetX, y - targetY);
      if (distance <= nearest) {
        nearest = distance;
        value = series;
      }
    }
    if (value !== undefined) return value;
    nearest = 8;
    for (const [series, group] of bySeries) {
      group.sort((a, b) => a.x - b.x);
      for (let index = 1; index < group.length; index += 1) {
        const a = group[index - 1]!;
        const b = group[index]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const portion = dx || dy
          ? Math.max(0, Math.min(1, ((targetX - a.x) * dx + (targetY - a.y) * dy) / (dx * dx + dy * dy)))
          : 0;
        const distance = Math.hypot(targetX - (a.x + portion * dx), targetY - (a.y + portion * dy));
        if (distance <= nearest) {
          nearest = distance;
          value = series;
        }
      }
    }
    return value;
  } catch {
    return undefined;
  }
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
