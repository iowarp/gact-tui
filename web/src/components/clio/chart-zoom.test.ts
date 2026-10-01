import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas: say so before Vega loads (it probes one for text
// metrics at import) so it estimates text width quietly.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import { parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { renderChartPreset } from './chart-presets';
import { compile } from 'vega-lite';
import {
  bindChartZoom,
  withZoomBrush,
  zoomBrushParamName,
  zoomComparableValue,
  zoomRangeFilterValue,
  zoomRangeFromSignal,
} from './chart-zoom';

/**
 * Real, headless Vega views, exactly like `chart-selection.test.ts`: these
 * pin the injected interval selection's resolved-signal shape to the
 * installed vega-lite instead of assuming it.
 */

const ROWS = [
  { depth: 1, magnitude: 2 },
  { depth: 5, magnitude: 3 },
  { depth: 10, magnitude: 4 },
];

async function headlessScatterView(): Promise<{ view: View; param: string }> {
  const base = renderChartPreset('scatter', {
    entityField: 'depth',
    selectionParam: 'sel',
    xField: 'depth',
    yField: 'magnitude',
  });
  const { param, spec } = withZoomBrush(base, { pointParam: 'sel', xField: 'depth' });
  const vega = compile(spec as unknown as Parameters<typeof compile>[0]).spec;
  const view = new View(parse(vega, undefined, { ast: true }), {
    expr: expressionInterpreter,
    renderer: 'none',
  });
  view.data(
    'source',
    ROWS.map((row) => ({ ...row })),
  );
  await view.runAsync();
  return { param: param!, view };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('withZoomBrush', () => {
  it('adds a second, independent interval param without touching the point-selection param', () => {
    const base = renderChartPreset('scatter', {
      entityField: 'depth',
      selectionParam: 'sel',
      xField: 'depth',
      yField: 'magnitude',
    });
    const { param, spec } = withZoomBrush(base, { pointParam: 'sel', xField: 'depth' });

    expect(param).toBe('sel_zoom');
    const params = spec!.params as Array<Record<string, unknown>>;
    expect(params).toHaveLength(2);
    expect(params[0]).toMatchObject({ name: 'sel' });
    expect(params[1]).toEqual({ name: 'sel_zoom', select: { encodings: ['x'], type: 'interval' } });
  });

  it('is a no-op without an x field', () => {
    const base = { data: { name: 'source' }, mark: 'point' };
    const result = withZoomBrush(base, { pointParam: 'sel', xField: undefined });
    expect(result).toEqual({ spec: base });
  });

  it('does not duplicate an existing interval param of the same name', () => {
    const base = {
      data: { name: 'source' },
      mark: 'point',
      params: [{ name: 'sel_zoom', select: { encodings: ['x'], type: 'interval' } }],
    };
    const { spec } = withZoomBrush(base, { pointParam: 'sel', xField: 'depth' });
    expect((spec!.params as unknown[]).length).toBe(1);
  });

  it('G3: attaches the brush to the FIRST layer only, never the top of a layered spec', () => {
    const base = {
      layer: [
        { data: { name: 'source' }, mark: 'point' },
        { data: { name: 'source' }, mark: 'rule' },
      ],
    };
    const { param, spec } = withZoomBrush(base, { pointParam: 'sel', xField: 'depth' });

    expect(param).toBe('sel_zoom');
    expect(spec).not.toHaveProperty('params');
    const layers = spec!.layer as Array<Record<string, unknown>>;
    expect(layers[0]!.params).toEqual([
      { name: 'sel_zoom', select: { encodings: ['x'], type: 'interval' } },
    ]);
    expect(layers[1]).not.toHaveProperty('params');
  });

  it('attaches the brush to the first sub-view of a concatenated spec', () => {
    const base = {
      hconcat: [
        { data: { name: 'source' }, mark: 'point' },
        { data: { name: 'source' }, mark: 'bar' },
      ],
    };
    const { spec } = withZoomBrush(base, { pointParam: 'sel', xField: 'depth' });

    const views = spec!.hconcat as Array<Record<string, unknown>>;
    expect(views[0]!.params).toEqual([
      { name: 'sel_zoom', select: { encodings: ['x'], type: 'interval' } },
    ]);
    expect(views[1]).not.toHaveProperty('params');
  });

  it('a layered spec with the brush attached compiles and runs without a duplicate-signal error', async () => {
    const base = {
      layer: [
        { data: { name: 'source' }, encoding: { x: { field: 'depth', type: 'quantitative' } }, mark: 'point' },
        { data: { name: 'source' }, encoding: { x: { field: 'depth', type: 'quantitative' } }, mark: 'rule' },
      ],
    };
    const { spec } = withZoomBrush(base, { pointParam: 'sel', xField: 'depth' });

    const vega = compile(spec as unknown as Parameters<typeof compile>[0]).spec;
    expect(() => parse(vega, undefined, { ast: true })).not.toThrow();
  });
});

describe('zoomBrushParamName', () => {
  it('derives from the point-selection param', () => {
    expect(zoomBrushParamName('sel')).toBe('sel_zoom');
    expect(zoomBrushParamName('picked')).toBe('picked_zoom');
  });
});

describe('chart brush/zoom wiring (vega-lite signal shape)', () => {
  it('resolves the brushed range keyed by the data field, in data units (not pixels)', async () => {
    const { param, view } = await headlessScatterView();

    // What a real drag produces internally: the pixel-space `<param>_x`
    // signal, which vega-lite inverts through the x scale into the resolved
    // `<param>` signal keyed by field name.
    view.signal(`${param}_x`, [0, view.width()]);
    await view.runAsync();

    const resolved = view.signal(param);
    expect(Object.keys(resolved)).toEqual(['depth']);
    expect(zoomRangeFromSignal(resolved, 'depth')).toEqual({
      max: expect.any(Number),
      min: expect.any(Number),
    });
  });

  it('reports no range once the brush clears', () => {
    expect(zoomRangeFromSignal({}, 'depth')).toBeUndefined();
    expect(zoomRangeFromSignal({ depth: [] }, 'depth')).toBeUndefined();
    expect(zoomRangeFromSignal({ other: [1, 2] }, 'depth')).toBeUndefined();
  });

  it('normalizes a reversed pair (a right-to-left drag)', () => {
    expect(zoomRangeFromSignal({ depth: [9, 2] }, 'depth')).toEqual({ max: 9, min: 2 });
  });

  it('debounces the bound listener and reports the final range once', async () => {
    vi.useFakeTimers();
    const { param, view } = await headlessScatterView();
    const onRangeChange = vi.fn();
    const binding = bindChartZoom(view, { onRangeChange, param, xField: 'depth' });

    view.signal(`${param}_x`, [0, 50]);
    await view.runAsync();
    view.signal(`${param}_x`, [0, 100]);
    await view.runAsync();
    expect(onRangeChange).not.toHaveBeenCalled();

    await vi.runAllTimersAsync();

    expect(onRangeChange).toHaveBeenCalledTimes(1);
    const [range] = onRangeChange.mock.calls[0]!;
    expect(range.min).toBeLessThanOrEqual(range.max);
    binding.dispose();
  });

  it('reports undefined once double-click clears the brush', async () => {
    vi.useFakeTimers();
    const { param, view } = await headlessScatterView();
    const onRangeChange = vi.fn();
    const binding = bindChartZoom(view, { onRangeChange, param, xField: 'depth' });

    view.signal(`${param}_x`, [0, 50]);
    await view.runAsync();
    await vi.runAllTimersAsync();
    expect(onRangeChange).toHaveBeenLastCalledWith(expect.objectContaining({ min: expect.any(Number) }));

    view.signal(`${param}_x`, []);
    await view.runAsync();
    await vi.runAllTimersAsync();

    expect(onRangeChange).toHaveBeenLastCalledWith(undefined);
    binding.dispose();
  });

  it('stops listening once disposed', async () => {
    vi.useFakeTimers();
    const { param, view } = await headlessScatterView();
    const onRangeChange = vi.fn();
    const binding = bindChartZoom(view, { onRangeChange, param, xField: 'depth' });
    binding.dispose();

    view.signal(`${param}_x`, [0, 50]);
    await view.runAsync();
    await vi.runAllTimersAsync();

    expect(onRangeChange).not.toHaveBeenCalled();
  });
});

describe('zoomRangeFilterValue', () => {
  it('passes a quantitative bound through unchanged', () => {
    expect(zoomRangeFilterValue(4.2, 'quantitative')).toBe(4.2);
    expect(zoomRangeFilterValue(4.2, undefined)).toBe(4.2);
  });

  it('converts a temporal bound (epoch millis) to an ISO string', () => {
    const millis = Date.parse('2026-08-01T00:00:00.000Z');
    expect(zoomRangeFilterValue(millis, 'temporal')).toBe('2026-08-01T00:00:00.000Z');
  });
});

describe('zoomComparableValue', () => {
  it('reads a quantitative numeric string as a number, never as a date (#516 review item 16)', () => {
    // The actual bug: `Date.parse("42.5")` is `NaN`, which silently dropped
    // every row from an inline chart's own client-side zoom filter.
    expect(zoomComparableValue('42.5', 'quantitative')).toBe(42.5);
    expect(zoomComparableValue('42.5', undefined)).toBe(42.5);
    expect(zoomComparableValue(42.5, 'quantitative')).toBe(42.5);
  });

  it('reads a temporal string as epoch millis', () => {
    expect(zoomComparableValue('2026-08-01T00:00:00.000Z', 'temporal')).toBe(
      Date.parse('2026-08-01T00:00:00.000Z'),
    );
  });

  it('reads a real Date value by its own time, regardless of the declared type', () => {
    const date = new Date('2026-08-01T00:00:00.000Z');
    expect(zoomComparableValue(date, 'temporal')).toBe(date.getTime());
    expect(zoomComparableValue(date, 'quantitative')).toBe(date.getTime());
  });

  it('returns undefined for an unparseable value, for either type', () => {
    expect(zoomComparableValue('not-a-number', 'quantitative')).toBeUndefined();
    expect(zoomComparableValue('not-a-date', 'temporal')).toBeUndefined();
    expect(zoomComparableValue(null, 'quantitative')).toBeUndefined();
    expect(zoomComparableValue(undefined, undefined)).toBeUndefined();
  });
});
