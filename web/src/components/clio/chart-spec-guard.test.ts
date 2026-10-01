import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import guardCases from '@/test-fixtures/chart/guard_cases.json';
import {
  CHART_SPEC_RULES,
  CHART_SPEC_RULES_SUPPORTED_VERSION,
  checkChartSpec,
  countViews,
  serializedSize,
  specDepth,
} from './chart-spec-guard';

// jsdom has no 2D canvas: say so before vega-lite loads (it probes one for
// text metrics at import) so it estimates text width quietly, matching
// chart-selection.test.ts / chart-zoom.test.ts.
vi.hoisted(() => {
  HTMLCanvasElement.prototype.getContext = () => null;
});

import { compile } from 'vega-lite';

/**
 * `clio-schemas` 0.5.2 `HASHES.json` entries for the chart resources this
 * renderer vendors. A mismatch means the copies drifted from the source of
 * truth: re-copy them from `schemas/a2ui/chart/` and update these hashes.
 */
const CLIO_SCHEMAS_CHART_HASHES: Record<string, string> = {
  'guard_rules.json': 'b25af2742b71a49aa134c0b4ca97ef6bc3032240014ef0a15b0ef89d9f5bdabc',
  'presets/boxplot.json': '6473a35c14bbde0d5c62e60b1647d608f7cc730b3eeee4a4cc3b2e382eef90bd',
  'presets/heatmap.json': 'd39995019b3b8269841dd74abe458fb71d14377b4f1335c6370045364dc498ed',
  'presets/scatter.json': '8212912d8324c53ec725fc3c277ef6c471aea245ad5b32043d336bef7c0c870f',
  'presets/spectra.json': '1723d96636ed662137ed58e760cf2c494e71711eba701cd83d7d9fea8d176b90',
  'presets/trajectories.json': 'acb91b6fcdc592a87e049ef5ed3edcd7bc3866abe28e136a0a466f55c926eb4b',
};

describe('chart spec guard', () => {
  it('implements the rules version clio-schemas ships', () => {
    expect(CHART_SPEC_RULES.version).toBe(CHART_SPEC_RULES_SUPPORTED_VERSION);
    expect(guardCases.version).toBe(CHART_SPEC_RULES_SUPPORTED_VERSION);
  });

  it.each(Object.entries(CLIO_SCHEMAS_CHART_HASHES))(
    'vendors %s byte-for-byte from clio-schemas',
    (file, hash) => {
      const bytes = readFileSync(resolve(process.cwd(), 'src/components/clio/chart-assets', file));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash);
    },
  );

  it.each(guardCases.cases.map((testCase) => [testCase.name, testCase] as const))(
    'agrees with the Python guard on %s',
    (_name, testCase) => {
      const violations = checkChartSpec(testCase.spec);
      const codes = [...new Set(violations.map((violation) => violation.code))].sort();
      if (testCase.valid) {
        expect(violations).toEqual([]);
      } else {
        expect(codes).toEqual([...(testCase as { codes: string[] }).codes].sort());
      }
    },
  );

  it('points at the offending node with a JSON Pointer', () => {
    const violations = checkChartSpec({
      layer: [{ mark: 'point', data: { url: 'https://example.test/x.csv' } }],
    });
    expect(violations.map(({ code, path }) => [code, path])).toEqual([
      ['data_not_named_source', '/layer/0/data'],
      ['forbidden_key', '/layer/0/data/url'],
    ]);
  });

  it('measures depth, size and views as the rules describe', () => {
    expect(specDepth(1)).toBe(0);
    expect(specDepth({})).toBe(1);
    expect(specDepth({ a: [{ b: 1 }] })).toBe(3);
    // Multi-byte characters count as their UTF-8 length.
    expect(serializedSize({ t: 'µ' })).toBe(JSON.stringify({ t: 'µ' }).length + 1);
    expect(countViews({ facet: {}, spec: { layer: [{ mark: 'line' }, { mark: 'point' }] } })).toBe(
      2,
    );
  });

  it('stops at the depth limit without walking a hostile spec', () => {
    let deep: unknown = 1;
    for (let level = 0; level < 5_000; level += 1) deep = { a: deep };
    expect(checkChartSpec(deep).map((violation) => violation.code)).toEqual(['spec_too_deep']);
  });

  it('forbids params[].bind.element — a signal binding that can target any element on the page', () => {
    // `bind_element_not_allowed` (`guard_rules.json`'s own `errorCodes`,
    // `clio_schemas.a2ui.chart_spec.check_chart_spec`): a `bind.element` CSS
    // selector escapes the chart's own container, unlike an ordinary
    // widget-binding `input`/`select`.
    const violations = checkChartSpec({
      mark: 'point',
      params: [{ name: 'sel', bind: { input: 'range', element: '#some-other-page-element' } }],
    });
    expect(violations.map(({ code, path }) => [code, path])).toEqual([
      ['bind_element_not_allowed', '/params/0/bind/element'],
    ]);
  });

  it('catches bind.element at any depth, not just directly under params[]', () => {
    // Matches clio-schemas' own `$defs/SpecNoBindElement`: it walks every
    // `bind` object recursively, not only ones nested under a top-level
    // `params`.
    const violations = checkChartSpec({
      layer: [{ mark: 'point', params: [{ name: 'sel', bind: { element: '#anywhere' } }] }],
    });
    expect(violations.map(({ code, path }) => [code, path])).toEqual([
      ['bind_element_not_allowed', '/layer/0/params/0/bind/element'],
    ]);
  });

  it('leaves an ordinary widget bind (no element selector) alone', () => {
    const violations = checkChartSpec({
      mark: 'point',
      params: [{ name: 'sel', bind: { input: 'range', min: 0, max: 10 } }],
    });
    expect(violations).toEqual([]);
  });

  describe('G4 gallery fixtures', () => {
    // The Altair-gallery fixtures proving the data-free layout keys and
    // `projection` (#1549 G4) pass both guards *and* actually compile —
    // guard-shaped JSON that vega-lite itself rejects would be a false pass.
    const galleryCases = guardCases.cases.filter((testCase) => testCase.name.startsWith('gallery-'));

    it('has the three required gallery fixtures (facet+columns, projection+geoshape, concat+spacing)', () => {
      expect(galleryCases.length).toBeGreaterThanOrEqual(3);
      for (const testCase of galleryCases) expect(testCase.valid).toBe(true);
    });

    it.each(galleryCases.map((testCase) => [testCase.name, testCase] as const))(
      '%s passes the guard and compiles with vega-lite',
      (_name, testCase) => {
        expect(checkChartSpec(testCase.spec)).toEqual([]);
        expect(() =>
          compile(testCase.spec as unknown as Parameters<typeof compile>[0]),
        ).not.toThrow();
      },
    );
  });
});
