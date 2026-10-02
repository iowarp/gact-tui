import { afterEach, describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas: say so before Vega loads (it probes one for text
// metrics at import) so it estimates text width quietly.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import { parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { compile, version as vegaLiteVersion } from 'vega-lite';
import {
  bindChartSelection,
  selectionFromSignal,
  selectionStoreName,
  viewHasSignal,
} from './chart-selection';
import { renderChartPreset } from './chart-presets';

/**
 * Real, headless Vega views (no DOM renderer): the read-back path writes
 * Vega-Lite's internal point-selection store, which is not a public API.
 * These tests pin that format to the installed vega-lite — when an upgrade
 * changes it, they fail here instead of the chart silently not highlighting.
 */

const ROWS = [
  { t: 0, v: 1.5, run: 'a' },
  { t: 1, v: 1.2, run: 'a' },
  { t: 0, v: 2.0, run: 'b' },
  { t: 1, v: 2.4, run: 'b' },
  { t: 0, v: 0.4, run: 'c' },
];

async function headlessView(preset = 'scatter', selectionParam = 'sel'): Promise<View> {
  const spec = renderChartPreset(preset, {
    xField: 't',
    yField: 'v',
    entityField: 'run',
    selectionParam,
  });
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
  return view;
}

/** Opacity of each drawn point, keyed by its `run`. */
function opacityByRun(view: View): Record<string, number[]> {
  const found: Record<string, number[]> = {};
  const visit = (node: { items?: unknown[]; datum?: { run?: string }; opacity?: number }) => {
    if (node.datum?.run !== undefined && typeof node.opacity === 'number') {
      (found[node.datum.run] ??= []).push(node.opacity);
    }
    for (const child of node.items ?? []) visit(child as typeof node);
  };
  visit((view.scenegraph() as unknown as { root: Parameters<typeof visit>[0] }).root);
  return found;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('chart selection wiring (vega-lite store format)', () => {
  it('is pinned to the vega-lite version whose store format it writes', () => {
    expect(vegaLiteVersion).toBe('6.4.3');
  });

  it('highlights a selection written by another component', async () => {
    const view = await headlessView();
    const write = vi.fn();
    const binding = bindChartSelection(view, {
      componentId: 'chart',
      param: 'sel',
      field: 'run',
      write,
    });

    await binding.apply({ field: 'run', values: ['b'], source: 'table' });

    expect(view.data(selectionStoreName('sel'))).toHaveLength(1);
    expect(view.signal('sel')).toMatchObject({ run: ['b'] });
    const opacity = opacityByRun(view);
    expect(new Set(opacity.b)).toEqual(new Set([1]));
    expect(new Set([...opacity.a!, ...opacity.c!])).toEqual(new Set([0.15]));
    binding.dispose();
  });

  it('never writes back the selection it was just given (no feedback loop)', async () => {
    vi.useFakeTimers();
    const view = await headlessView();
    const write = vi.fn();
    const binding = bindChartSelection(view, {
      componentId: 'chart',
      param: 'sel',
      field: 'run',
      write,
    });

    await binding.apply({ field: 'run', values: ['a', 'c'], source: 'table' });
    // A selection on a field the chart does not select by still echoes as itself.
    await binding.apply({ field: 'site', values: ['north'], source: 'map' });
    await vi.runAllTimersAsync();

    expect(write).not.toHaveBeenCalled();
    binding.dispose();
  });

  it('restores its own selection into a freshly embedded view without echoing', async () => {
    vi.useFakeTimers();
    const view = await headlessView();
    const write = vi.fn();
    const binding = bindChartSelection(view, {
      componentId: 'chart',
      param: 'sel',
      field: 'run',
      write,
    });

    await binding.apply({ field: 'run', values: ['a'], source: 'chart' });
    await vi.runAllTimersAsync();

    expect(view.signal('sel')).toMatchObject({ run: ['a'] });
    expect(write).not.toHaveBeenCalled();
    binding.dispose();
  });

  it('writes a selection made in the chart, debounced, with itself as the source', async () => {
    vi.useFakeTimers();
    const view = await headlessView('trajectories', 'picked');
    const write = vi.fn();
    const binding = bindChartSelection(view, {
      componentId: 'chart',
      param: 'picked',
      field: 'run',
      write,
    });

    // What Vega-Lite's own click handler does: set the tuple signal, which modifies the store.
    const fields = view.signal('picked_tuple_fields');
    view.signal('picked_tuple', { unit: '', fields, values: ['a'] });
    await view.runAsync();
    view.signal('picked_tuple', { unit: '', fields, values: ['c'] });
    await view.runAsync();
    expect(write).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenCalledWith({ field: 'run', values: ['c'], source: 'chart' });

    // Unchanged content is not written again.
    view.signal('picked_tuple', { unit: '', fields, values: ['c'] });
    await view.runAsync();
    await vi.runAllTimersAsync();
    expect(write).toHaveBeenCalledTimes(1);
    binding.dispose();
  });

  it('stops listening when disposed', async () => {
    vi.useFakeTimers();
    const view = await headlessView();
    const write = vi.fn();
    const binding = bindChartSelection(view, {
      componentId: 'chart',
      param: 'sel',
      field: 'run',
      write,
    });
    binding.dispose();

    view.data(selectionStoreName('sel'), [
      { unit: '', fields: [{ type: 'E', field: 'run' }], values: ['a'] },
    ]);
    await view.runAsync();
    await vi.runAllTimersAsync();
    expect(write).not.toHaveBeenCalled();
  });

  it('select() highlights a value exactly like a native click, and reports it like one too (#1533 #506 LOW)', async () => {
    // A keyboard-operable control (a <Select>, since arbitrary brush/lasso
    // gestures have no keyboard equivalent) drives selection through this
    // method instead of simulating pointer events — it must take the
    // identical path apply()/a real click do: the view highlights it AND the
    // signal listener reports it through `write`, unlike apply() (which is
    // for showing an externally-sourced state, and never echoes back).
    vi.useFakeTimers();
    const view = await headlessView();
    const write = vi.fn();
    const binding = bindChartSelection(view, {
      componentId: 'chart',
      param: 'sel',
      field: 'run',
      write,
    });

    await binding.select(['b']);

    expect(view.data(selectionStoreName('sel'))).toHaveLength(1);
    const opacity = opacityByRun(view);
    expect(new Set(opacity.b)).toEqual(new Set([1]));
    expect(new Set([...opacity.a!, ...opacity.c!])).toEqual(new Set([0.15]));
    await vi.runAllTimersAsync();
    expect(write).toHaveBeenCalledWith({ field: 'run', values: ['b'], source: 'chart' });
    binding.dispose();
  });

  it('select() is a no-op once disposed', async () => {
    const view = await headlessView();
    const binding = bindChartSelection(view, {
      componentId: 'chart',
      param: 'sel',
      field: 'run',
      write: vi.fn(),
    });
    binding.dispose();

    await binding.select(['a']);

    expect(view.data(selectionStoreName('sel'))).toEqual([]);
  });

  it('knows whether a spec defines the selection param', async () => {
    const view = await headlessView();
    expect(viewHasSignal(view, 'sel')).toBe(true);
    expect(viewHasSignal(view, 'brush')).toBe(false);
  });

  it('reads the selected values of the selection field from the resolved signal', () => {
    expect(selectionFromSignal({ run: ['a'], vlPoint: {} }, 'run')).toEqual({
      field: 'run',
      values: ['a'],
    });
    // A cleared selection resolves to {}.
    expect(selectionFromSignal({}, 'run')).toEqual({ field: 'run', values: [] });
    // A spec chart without selectionField names the one field it selected by.
    expect(selectionFromSignal({ site: ['n'], vlPoint: {} }, undefined)).toEqual({
      field: 'site',
      values: ['n'],
    });
    // Selected only by Vega's internal row id: nothing to report.
    expect(selectionFromSignal({ _vgsid_: [3] }, undefined)).toBeUndefined();
  });
});
