import { describe, expect, it, vi } from 'vitest';

// jsdom has no 2D canvas: say so before vega-lite loads (it probes one for
// text metrics at import) so it estimates text width quietly, matching
// chart-selection.test.ts / chart-zoom.test.ts.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import { parse, View } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';
import { compile } from 'vega-lite';
import guardCases from '@/test-fixtures/chart/guard_cases.json';
import { prepareChartSpec } from './chart-embed';

/**
 * The Altair-gallery fixtures (clio-schemas #1549 G4 review) proved they
 * pass the guard and compile with vega-lite (`chart-spec-guard.test.ts`'s own
 * "G4 gallery fixtures" describe block). Compiling is not rendering: this
 * review live-verified that a geoshape mark whose shape channel is a
 * geojson-typed field draws NOTHING (every coordinate NaN) when
 * `projection.fit` is left to the renderer's own data-driven auto-fit — a
 * real bug in the installed vega/vega-lite/vega-embed versions, worked
 * around by setting `projection.fit` to inline GeoJSON explicitly (the
 * choropleth fixture now does). This file runs every gallery fixture through
 * a REAL headless vega `View`, built from `prepareChartSpec` exactly as the
 * renderer embeds a chart, and asserts real marks are drawn at real (never
 * NaN) coordinates — the same way `chart-zoom.test.ts` / `chart-
 * selection.test.ts` already drive a real view for their own assertions,
 * rather than only inspecting the compiled Vega spec or a non-empty `d`
 * string (a NaN path has a non-empty, but meaningless, `d`). Does not touch
 * `chart-embed.ts` itself.
 */

type GalleryCase = (typeof guardCases.cases)[number] & {
  data?: readonly Record<string, unknown>[];
};

/**
 * Synthetic rows for the gallery fixtures that exist to prove a guard rule
 * (no inline `data` of their own) — just enough to draw one mark of each
 * case's kind. The geometry/lon-lat fixtures already carry realistic rows.
 */
const SYNTHETIC_ROWS: Record<string, readonly Record<string, unknown>[]> = {
  'gallery-concat-spacing-and-alignment': [
    { t: 0, v: 1 },
    { t: 1, v: 2 },
    { t: 2, v: 1.5 },
  ],
  'gallery-padding-layout': [
    { category: 'A', v: 3 },
    { category: 'B', v: 5 },
  ],
  'gallery-wrapped-facet-columns': [
    { category: 'A', t: 0, v: 1 },
    { category: 'A', t: 1, v: 2 },
    { category: 'B', t: 0, v: 3 },
    { category: 'B', t: 1, v: 1 },
  ],
};

const GALLERY_CASES = guardCases.cases.filter((testCase): testCase is GalleryCase =>
  testCase.name.startsWith('gallery-'),
);

/** Compile, run headless, and render one gallery case's spec+rows to SVG. */
async function renderGalleryCaseToSvg(testCase: GalleryCase): Promise<string> {
  const rows = testCase.data ?? SYNTHETIC_ROWS[testCase.name];
  if (!rows) throw new Error(`no rows given or synthesized for gallery case ${testCase.name}`);
  const prepared = prepareChartSpec(testCase.spec as Record<string, unknown>, {
    height: 240,
    rows: rows.map((row) => ({ ...row })),
    width: 320,
  });
  const vegaSpec = compile(prepared as unknown as Parameters<typeof compile>[0]).spec;
  const view = new View(parse(vegaSpec, undefined, { ast: true }), {
    expr: expressionInterpreter,
    renderer: 'none',
  });
  await view.runAsync();
  return view.toSVG();
}

/** Every non-background `<path>`/`<rect>`/`<circle>` element's opening tag. */
function markTags(svg: string): string[] {
  return [...svg.matchAll(/<(?:path|rect|circle)\b[^>]*\/?>/gu)]
    .map(([tag]) => tag)
    .filter((tag) => !tag.includes('class="background"') && !tag.includes('class="foreground"'));
}

/** True if a numeric attribute anywhere in the tag is NaN — a failed projection. */
function hasNaN(tag: string): boolean {
  return /NaN/.test(tag);
}

/** The `d` attribute's value, or '' if the tag has none. */
function dAttr(tag: string): string {
  return /\bd="([^"]*)"/.exec(tag)?.[1] ?? '';
}

describe('chart gallery fixtures render real marks, not just compile (#1549 G4 review)', () => {
  it('has at least the five gallery fixtures this suite covers', () => {
    expect(GALLERY_CASES.length).toBeGreaterThanOrEqual(5);
    for (const testCase of GALLERY_CASES) expect(testCase.valid).toBe(true);
  });

  it.each(GALLERY_CASES.map((testCase) => [testCase.name, testCase] as const))(
    '%s draws at least one real mark, never a NaN coordinate',
    async (_name, testCase) => {
      const svg = await renderGalleryCaseToSvg(testCase);
      expect(svg).toContain('<svg');
      const tags = markTags(svg);
      expect(tags.length).toBeGreaterThan(0);
      for (const tag of tags) expect(hasNaN(tag)).toBe(false);
    },
  );

  it('draws one geoshape path per input polygon, each with real, non-NaN projected coordinates', async () => {
    const testCase = GALLERY_CASES.find(
      (candidate) => candidate.name === 'gallery-choropleth-projection-geojson',
    )!;
    const svg = await renderGalleryCaseToSvg(testCase);
    const geoshapeTags = markTags(svg).filter((tag) => tag.includes('"geoshape"'));
    expect(geoshapeTags.length).toBe(testCase.data!.length);
    for (const tag of geoshapeTags) {
      expect(hasNaN(tag)).toBe(false);
      const d = dAttr(tag);
      expect(d.length).toBeGreaterThan(0);
      // A real projected ring: at least a moveto and a lineto with actual digits.
      expect(d).toMatch(/^M[\d.]+,[\d.]+L[\d.]+,[\d.]+/);
    }
  });

  it('draws one circle mark per lon/lat row, each positioned at a real, non-NaN projected point', async () => {
    const testCase = GALLERY_CASES.find(
      (candidate) => candidate.name === 'gallery-lon-lat-point-map',
    )!;
    const svg = await renderGalleryCaseToSvg(testCase);
    const circleTags = markTags(svg).filter((tag) => tag.includes('"circle"') && tag.includes('aria-label'));
    expect(circleTags.length).toBe(testCase.data!.length);
    for (const tag of circleTags) {
      expect(hasNaN(tag)).toBe(false);
      expect(tag).toMatch(/transform="translate\([-\d.e]+,[-\d.e]+\)"/);
    }
  });
});
