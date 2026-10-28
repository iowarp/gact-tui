import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import { escapeHtml, formatChartTooltip, prepareChartSpec, refusingLoader } from './chart-embed';
import { chartPresentationConfig } from './chart-presentation';
import {
  clearManualChartZoom,
  withChartBoxSelection,
  withChartPointSelection,
  withManualChartZoom,
  zoomChartToRows,
} from './chart-box-selection';

const rows = [
  { year: 2000, ratio: 12.95 },
  { year: 2024, ratio: 10.81 },
];
const authored = {
  width: 600,
  height: 300,
  mark: { type: 'point', filled: true },
  encoding: {
    x: { field: 'year', type: 'quantitative', scale: { zero: false } },
    y: { field: 'ratio', type: 'quantitative' },
  },
};

describe('responsive chart embedding', () => {
  it('renders a constant mean rule with selectable, zoomable observation layers', async () => {
    const source = rows.map((row, __row) => ({ ...row, __row }));
    const spec = {
      width: 600,
      height: 300,
      layer: [
        { mark: 'rule', encoding: { y: { datum: 12.139, type: 'quantitative' } } },
        { mark: 'line', encoding: authored.encoding },
        { mark: 'point', encoding: authored.encoding },
      ],
    };
    const selected = withChartPointSelection(spec, 'sel', '__row');
    const brush = withChartBoxSelection(selected, {
      pointParam: 'sel',
      xField: 'year',
      yField: 'ratio',
    });
    const zoom = withManualChartZoom(brush.spec, {
      pointParam: 'sel',
      xField: 'year',
      yField: 'ratio',
    });
    const prepared = prepareChartSpec(zoom.spec, { width: 800, height: 500, rows: source });
    const compiled = compile(prepared as unknown as Parameters<typeof compile>[0]).spec;
    const view = new View(parse(compiled), { renderer: 'none' });
    try {
      await view.runAsync();
      expect(view.signal('sel_box')).toBeDefined();
      expect(view.signal('sel_zoom')).toBeDefined();
      expect(
        await zoomChartToRows(
          view,
          'sel_zoom',
          source,
          'year',
          'ratio',
          'quantitative',
          'quantitative',
        ),
      ).toBe(true);
      const x = view.scale('x') as ((value: number) => number) & { domain(): number[] };
      expect(x.domain()[0]).toBeCloseTo(1998.56);
      expect(x.domain()[1]).toBeCloseTo(2025.44);
      clearManualChartZoom(view, 'sel_zoom');
      await view.runAsync();
      expect((view.scale('x') as { domain(): number[] }).domain().every(Number.isFinite)).toBe(
        true,
      );
      expect(await view.toSVG()).toContain('role="graphics-symbol"');
    } finally {
      view.finalize();
    }
  });
  it('draws a faceted spec with the renderer’s selection, brush and zoom on its plot unit', async () => {
    // A plugin's fixed spec (the bench readings view): one panel per input.
    const facetRows = [0.5, 1.0].map((arm, __row) => ({
      __row,
      arm,
      mass: 0.2,
      period: 1.4 + arm,
    }));
    const faceted = {
      data: { name: 'source' },
      transform: [{ fold: ['arm', 'mass'], as: ['input', 'setting'] }],
      facet: { field: 'input', type: 'nominal' },
      columns: 2,
      resolve: { scale: { x: 'independent' } },
      spec: {
        width: 260,
        height: 170,
        mark: { type: 'point', filled: true },
        encoding: {
          x: { field: 'setting', type: 'quantitative' },
          y: { field: 'period', type: 'quantitative' },
        },
      },
    };
    const selected = withChartPointSelection(faceted, 'sel', '__row');
    const brush = withChartBoxSelection(selected, {
      pointParam: 'sel',
      xField: 'setting',
      yField: 'period',
    });
    const zoom = withManualChartZoom(brush.spec, {
      pointParam: 'sel',
      xField: 'setting',
      yField: 'period',
    });
    // Every selection sits on the plot unit; a facet-root one would not compile.
    expect(zoom.spec).not.toHaveProperty('params');
    const prepared = prepareChartSpec(zoom.spec, { width: 800, height: 500, rows: facetRows });
    const compiled = compile(prepared as unknown as Parameters<typeof compile>[0]).spec;
    const view = new View(parse(compiled), { renderer: 'none' });
    try {
      await view.runAsync();
      for (const name of ['sel', 'sel_box', 'sel_zoom']) expect(view.signal(name)).toBeDefined();
      expect(await view.toSVG()).toContain('role="graphics-symbol"');
    } finally {
      view.finalize();
    }
  });
  it.each([
    [440, 360],
    [1100, 780],
  ])(
    'fits the real plot to a %i by %i viewer despite fixed authoring dimensions',
    async (width, height) => {
      const prepared = prepareChartSpec(authored, { width, height, rows });
      const compiled = compile(prepared as unknown as Parameters<typeof compile>[0], {
        config: chartPresentationConfig(),
      }).spec;
      const view = new View(parse(compiled), { renderer: 'none' });
      try {
        await view.runAsync();
        const svg = await view.toSVG();
        const outer = svg.match(/<svg[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/);
        expect(Number(outer?.[1])).toBeLessThanOrEqual(width);
        expect(Number(outer?.[1])).toBeGreaterThan(width - 30);
        expect(Number(outer?.[2])).toBeGreaterThan(height - 30);
        expect(Number(outer?.[2])).toBeLessThanOrEqual(height);
        const labels = [...svg.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
        expect(labels).not.toContain('2,000');
        expect(labels).not.toContain('2,024');
        expect(labels).toContain('2000');
        expect(labels).not.toContain('1e+1');
        const scale = view.scale('x') as (value: number) => number;
        expect(scale(2000)).toBeGreaterThanOrEqual(10);
        expect(scale(2024)).toBeLessThan(view.width() - 10);
      } finally {
        view.finalize();
      }
      expect(authored).toMatchObject({ width: 600, height: 300 });
    },
  );

  it('resolves container width and preserves independent composition geometry', () => {
    const single = prepareChartSpec(
      { ...authored, width: 'container' },
      { width: 800, height: 500, rows },
    );
    expect(single).toMatchObject({ width: 800, height: 500 });
    const composed = { hconcat: [authored, authored] };
    expect(prepareChartSpec(composed, { width: 800, height: 500, rows }).hconcat).toEqual(
      composed.hconcat,
    );
  });
});

describe('chart embedding restrictions', () => {
  it('refuses every load, link, and file', async () => {
    const loader = refusingLoader();
    await expect(loader.load('https://example.test/x.csv')).rejects.toThrow(/cannot load/u);
    await expect(
      loader.sanitize('https://example.test/x.png', { context: 'href' }),
    ).rejects.toThrow(/cannot load/u);
    await expect(loader.http('https://example.test/x.csv', {})).rejects.toThrow(/cannot load/u);
    await expect(loader.file('/etc/passwd')).rejects.toThrow(/cannot load/u);
  });

  it('keeps tooltips to escaped text and drops images', () => {
    const html = formatChartTooltip({
      title: '<b>run</b>',
      image: 'https://example.test/tracker.png',
      '<i>key</i>': '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img');
    expect(html).not.toContain('tracker.png');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<h2>&lt;b&gt;run&lt;/b&gt;</h2>');
    expect(escapeHtml(`"'&`)).toBe('&quot;&#39;&amp;');
  });
});
