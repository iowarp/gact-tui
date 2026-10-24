import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import { prepareChartSpec } from './chart-embed';
import { resizeChartView } from './chart-responsive-layout';
import { chartPresentationConfig } from './chart-presentation';

const rows = [
  { time: 16.25, value: 1, other: 455, group: 'a' },
  { time: 16.75, value: 1000, other: 456, group: 'b' },
];
const unit = {
  width: 300,
  height: 120,
  mark: 'point',
  encoding: {
    x: { field: 'time', type: 'quantitative', scale: { zero: false } },
    y: { field: 'value', type: 'quantitative' },
  },
};

async function chart(
  spec: Record<string, unknown>,
): Promise<{ view: View; compiled: ReturnType<typeof compile>['spec'] }> {
  const prepared = prepareChartSpec(spec, { width: 640, height: 320, rows });
  const compiled = compile(prepared as unknown as Parameters<typeof compile>[0], {
    config: chartPresentationConfig(),
  }).spec;
  const view = new View(parse(compiled), { renderer: 'none' });
  await view.runAsync();
  return { view, compiled };
}

async function svgWidth(view: View): Promise<number> {
  return Number((await view.toSVG()).match(/<svg[^>]*width="([\d.]+)"/)?.[1]);
}

describe('live chart layout', () => {
  it('uses the fullscreen height without shrinking readable inline panels', async () => {
    const { view, compiled } = await chart({ vconcat: [unit, unit, unit] });
    try {
      await resizeChartView(view, compiled, { width: 700, height: 320 });
      expect(view.signal('childHeight')).toBe(120);
      await resizeChartView(view, compiled, { width: 700, height: 720, fillHeight: true });
      const height = Number((await view.toSVG()).match(/<svg[^>]*height="([\d.]+)"/)?.[1]);
      expect(height).toBeGreaterThanOrEqual(716);
      expect(height).toBeLessThanOrEqual(724);
      expect(Number(view.signal('childHeight'))).toBeGreaterThan(150);
    } finally {
      view.finalize();
    }
  });

  it.each([
    ['vertical stack', { vconcat: [unit, unit, unit] }],
    ['horizontal panels', { hconcat: [unit, unit] }],
    ['wrapped panels', { concat: [unit, unit, unit], columns: 2 }],
    ['facet columns', { facet: { column: { field: 'group', type: 'nominal' } }, spec: unit }],
    [
      'repeated columns',
      {
        repeat: { column: ['value', 'other'] },
        spec: {
          ...unit,
          encoding: { ...unit.encoding, y: { field: { repeat: 'column' }, type: 'quantitative' } },
        },
      },
    ],
    ['nested composition', { hconcat: [{ vconcat: [unit, unit] }, unit] }],
  ])('fits %s to changing real bounds', async (_name, spec) => {
    const original = JSON.stringify(spec);
    const { view, compiled } = await chart(spec);
    try {
      for (const width of [640, 1100, 420, 800]) {
        await resizeChartView(view, compiled, { width, height: 600 });
        expect(await svgWidth(view)).toBeGreaterThanOrEqual(width - 4);
        expect(await svgWidth(view)).toBeLessThanOrEqual(width + 4);
      }
      expect(JSON.stringify(spec)).toBe(original);
    } finally {
      view.finalize();
    }
  });

  it('keeps different scientific scales, observations and live parameters through resizing', async () => {
    const second = {
      ...unit,
      encoding: {
        ...unit.encoding,
        y: {
          field: 'other',
          type: 'quantitative',
          scale: { domain: [450, 460], zero: false },
        },
      },
    };
    const { view, compiled } = await chart({
      params: [{ name: 'reviewedTime', value: 16.5 }],
      vconcat: [unit, second],
      resolve: { scale: { y: 'independent' } },
    });
    try {
      view.signal('reviewedTime', 16.75);
      const before = view.data('source');
      const domains = compiled.scales?.map((scale) => [
        scale.name,
        (view.scale(scale.name) as { domain(): unknown }).domain(),
      ]);
      await resizeChartView(view, compiled, { width: 1050, height: 700 });
      expect(view.signal('reviewedTime')).toBe(16.75);
      expect(view.data('source')).toBe(before);
      for (const [name, domain] of domains ?? []) {
        expect((view.scale(name as string) as { domain(): unknown }).domain()).toEqual(domain);
      }
    } finally {
      view.finalize();
    }
  });

  it('retains readable panels and scrolling when a composition cannot fit a narrow screen', async () => {
    const { view, compiled } = await chart({ hconcat: [unit, unit, unit] });
    try {
      await resizeChartView(view, compiled, { width: 240, height: 500 });
      expect(Number(view.signal('childWidth'))).toBe(120);
      expect(await svgWidth(view)).toBeGreaterThan(240);
    } finally {
      view.finalize();
    }
  });

  it('resizes a single plot in place without resetting a parameter', async () => {
    const { view, compiled } = await chart({ ...unit, params: [{ name: 'cutoff', value: 1 }] });
    try {
      view.signal('cutoff', 50);
      await resizeChartView(view, compiled, { width: 900, height: 500 });
      expect(await svgWidth(view)).toBe(900);
      expect(view.signal('cutoff')).toBe(50);
    } finally {
      view.finalize();
    }
  });
});
