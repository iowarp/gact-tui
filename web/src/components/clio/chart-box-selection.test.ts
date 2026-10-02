import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bindChartBoxSelection,
  chartZoomParamName,
  chartBoxSelectionParamName,
  chartBoxSelectionValues,
  clearManualChartZoom,
  withManualChartZoom,
  withChartBoxSelection,
  withChartLinePointTargets,
  withChartPointSelection,
  chartMarkSelectionValue,
  nearestChartSeriesValue,
} from './chart-box-selection';
import type { ChartRow } from './chart-data';
import { renderChartPreset } from './chart-presets';
import { parse } from 'vega';
import { compile } from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';

afterEach(() => {
  vi.useRealTimers();
});

describe('series selection targets', () => {
  it('adds Shift toggle to a preset selection and makes line dots easier to click', () => {
    const preset = renderChartPreset('trajectories', {
      entityField: 'id', selectionParam: 'sel', xField: 'day', yField: 'value',
    });
    const spec = withChartLinePointTargets(withChartPointSelection(preset, 'sel', 'id'));
    expect((spec.mark as Record<string, unknown>).point).toEqual({ filled: true, size: 100 });
    expect((spec.params as Array<Record<string, unknown>>)[0]?.select).toMatchObject({
      toggle: 'event.shiftKey', fields: ['id'],
    });
  });

  it('reads a series key from nested Vega line and point scenegraph items', () => {
    expect(chartMarkSelectionValue({ datum: { id: 'storm-a' } }, 'id')).toBe('storm-a');
    expect(chartMarkSelectionValue({ datum: { values: [{ datum: { id: 'storm-b' } }] } }, 'id'))
      .toBe('storm-b');
    expect(chartMarkSelectionValue({ datum: { unrelated: 2 } }, 'id')).toBeUndefined();
  });

  it('uses plotted coordinates to distinguish series even when a Vega line item is stale', () => {
    const view = {
      origin: () => [10, 5] as [number, number],
      scale: () => (value: number) => value,
    } as never;
    const rows = [
      { id: 'A', x: 0, y: 10 }, { id: 'A', x: 20, y: 10 },
      { id: 'B', x: 0, y: 40 }, { id: 'B', x: 20, y: 40 },
    ];
    expect(nearestChartSeriesValue(view, rows, { x: 20, y: 45 }, 'x', 'y', 'id', 'quantitative'))
      .toBe('B');
    expect(nearestChartSeriesValue(view, rows, { x: 20, y: 15 }, 'x', 'y', 'id', 'quantitative'))
      .toBe('A');
    expect(nearestChartSeriesValue(view, rows, { x: 20, y: 90 }, 'x', 'y', 'id', 'quantitative'))
      .toBeUndefined();
  });
});

describe('withChartBoxSelection', () => {
  it('compiles a boxplot with its brush on the point layer exactly once', () => {
    const base = renderChartPreset('boxplot', {
      entityField: 'id', selectionParam: 'sel', xField: 'country', yField: 'latitude',
    });
    const result = withChartBoxSelection(base, {
      pointParam: 'sel', xField: 'country', yField: 'latitude',
    });
    const layers = result.spec.layer as Array<Record<string, unknown>>;
    expect(layers[0]?.params).toBeUndefined();
    expect((layers[1]!.params as Array<{ name: string }>).map((entry) => entry.name)).toContain('sel_box');
    expect(() => parse(compile(result.spec as unknown as TopLevelSpec).spec)).not.toThrow();
  });
  it('adds a two-dimensional interval param to the first plot unit', () => {
    const base = {
      layer: [
        { data: { name: 'source' }, mark: 'point' },
        { data: { name: 'source' }, mark: 'rule' },
      ],
    };
    const result = withChartBoxSelection(base, {
      pointParam: 'sel',
      xField: 'depth',
      yField: 'magnitude',
    });

    expect(chartBoxSelectionParamName('sel')).toBe('sel_box');
    expect(result.param).toBe('sel_box');
    expect(result.spec.layer).toHaveLength(2);
    expect((result.spec.layer as Array<Record<string, unknown>>)[0]!.params).toEqual([
      {
        name: 'sel_box',
      select: {
        clear: 'dblclick',
        encodings: ['x', 'y'],
        on: '[pointerdown[event.shiftKey], window:pointerup] > window:pointermove!',
        type: 'interval',
      },
      },
    ]);
    expect((result.spec.layer as Array<Record<string, unknown>>)[1]).not.toHaveProperty('params');
  });

  it('reserves Shift+drag for selection and creates a separate scale-bound zoom param', () => {
    const base = renderChartPreset('scatter', {
      entityField: 'id',
      selectionParam: 'sel',
      xField: 'depth',
      yField: 'magnitude',
    });
    const box = withChartBoxSelection(base, {
      pointParam: 'sel',
      xField: 'depth',
      yField: 'magnitude',
    });
    const zoom = withManualChartZoom(box.spec!, {
      pointParam: 'sel',
      xField: 'depth',
      yField: 'magnitude',
    });
    const firstLayer = Array.isArray(zoom.spec.layer)
      ? (zoom.spec.layer as Array<Record<string, unknown>>)[0]!
      : zoom.spec;
    const params = firstLayer.params as Array<Record<string, unknown>>;
    const rootParams = zoom.spec.params as Array<Record<string, unknown>>;

    expect(chartZoomParamName('sel')).toBe('sel_zoom');
    const boxParam = params.find((entry) => entry.name === 'sel_box');
    expect(boxParam).toMatchObject({
      name: 'sel_box',
      select: { encodings: ['x', 'y'], type: 'interval' },
    });
    expect(boxParam!.select).toMatchObject({ on: expect.stringContaining('event.shiftKey') });
    const zoomParam = rootParams.find((entry) => entry.name === 'sel_zoom');
    expect(zoomParam).toMatchObject({
      bind: 'scales',
      name: 'sel_zoom',
      select: { encodings: ['x', 'y'], type: 'interval' },
    });
    expect(zoomParam!.select).toMatchObject({
      translate: expect.stringContaining('!event.shiftKey'),
    });
  });

  it('uses an ordinary drag only while the visible box mode is active', () => {
    const base = { mark: 'point', encoding: { x: { field: 'x', type: 'quantitative' }, y: { field: 'y', type: 'quantitative' } } };
    const passive = withChartBoxSelection(base, { pointParam: 'sel', xField: 'x', yField: 'y' });
    const active = withChartBoxSelection(base, { pointParam: 'sel', xField: 'x', yField: 'y', active: true });
    expect(JSON.stringify(passive.spec)).toContain('event.shiftKey');
    expect(JSON.stringify(active.spec)).toContain('!event.altKey');
    expect(JSON.stringify(active.spec)).not.toContain('event.shiftKey');
  });

  it('leaves charts without both axes alone', () => {
    const base = { mark: 'point' };
    expect(
      withChartBoxSelection(base, { pointParam: 'sel', xField: 'depth', yField: undefined }),
    ).toEqual({ spec: base });
  });
});

describe('chartBoxSelectionValues', () => {
  const rows: ChartRow[] = [
    { id: 'inside', depth: 3, magnitude: 4 },
    { id: 'outside-x', depth: 8, magnitude: 4 },
    { id: 'outside-y', depth: 3, magnitude: 7 },
    { id: 'boundary', depth: 5, magnitude: 6 },
  ];
  const options = {
    rows,
    selectionField: 'id',
    xField: 'depth',
    xType: 'quantitative' as const,
    yField: 'magnitude',
    yType: 'quantitative' as const,
  };

  it('returns only rows inside both inclusive box edges', () => {
    expect(chartBoxSelectionValues({ depth: [3, 5], magnitude: [4, 6] }, options)).toEqual([
      'inside',
      'boundary',
    ]);
  });

  it('supports temporal axes and reversed drag bounds', () => {
    const temporalRows: ChartRow[] = [
      { id: 'early', time: '2026-08-01T00:00:00Z', depth: 1 },
      { id: 'late', time: '2026-08-03T00:00:00Z', depth: 5 },
    ];
    expect(
      chartBoxSelectionValues(
        { time: [Date.parse('2026-08-04T00:00:00Z'), Date.parse('2026-08-02T00:00:00Z')], depth: [6, 2] },
        {
          rows: temporalRows,
          selectionField: 'id',
          xField: 'time',
          xType: 'temporal',
          yField: 'depth',
          yType: 'quantitative',
        },
      ),
    ).toEqual(['late']);
  });

  it('returns no selected rows for an empty or malformed interval', () => {
    expect(chartBoxSelectionValues({}, options)).toEqual([]);
    expect(chartBoxSelectionValues({ depth: [1], magnitude: [1, 2] }, options)).toEqual([]);
  });
});

describe('bindChartBoxSelection', () => {
  it('debounces the gesture and disposes its listener', async () => {
    vi.useFakeTimers();
    let listener: ((_name: string, signal: unknown) => void) | undefined;
    const view = {
      addSignalListener: vi.fn((_name: string, next: typeof listener) => {
        listener = next;
      }),
      removeSignalListener: vi.fn(),
    };
    const write = vi.fn();
    const binding = bindChartBoxSelection(view, {
      param: 'sel_box',
      read: (signal) => (Array.isArray(signal) ? (signal as Array<string | number>) : []),
      write,
      debounceMs: 50,
    });

    listener?.('sel_box', ['a']);
    listener?.('sel_box', ['a', 'b']);
    await vi.advanceTimersByTimeAsync(50);
    expect(write).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith(['a', 'b']);

    binding.dispose();
    expect(view.removeSignalListener).toHaveBeenCalledWith('sel_box', listener);
    vi.useRealTimers();
  });
});

describe('clearManualChartZoom', () => {
  it('clears the interval store before rerunning Vega', async () => {
    const view = {
      data: vi.fn(),
      runAsync: vi.fn(async () => undefined),
    } as unknown as import('vega').View;

    clearManualChartZoom(view, 'sel_zoom');
    expect(view.data).toHaveBeenCalledWith('sel_zoom_store', []);
    expect(view.runAsync).toHaveBeenCalledOnce();
  });
});
