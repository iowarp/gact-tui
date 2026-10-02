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
  'guard_rules.json': '5dfdf33ce061c686d0e74586751cc622098759513f3450b572d400b56479abe7',
  'presets/boxplot.json': '97d9abfe03358a121400f5f063de9c46891962da7a388a718fd2c9231915c6d0',
  'presets/heatmap.json': 'd39995019b3b8269841dd74abe458fb71d14377b4f1335c6370045364dc498ed',
  'presets/scatter.json': '8212912d8324c53ec725fc3c277ef6c471aea245ad5b32043d336bef7c0c870f',
  'presets/spectra.json': '1723d96636ed662137ed58e760cf2c494e71711eba701cd83d7d9fea8d176b90',
  'presets/trajectories.json': 'acb91b6fcdc592a87e049ef5ed3edcd7bc3866abe28e136a0a466f55c926eb4b',
};

/**
 * The shared fixtures themselves (`a2ui/chart/fixtures/*.json` in
 * clio-schemas — shipped as package data and hashed since #1549 G4), vendored
 * here at `test-fixtures/chart/` rather than `chart-assets/`: they are test
 * data, never shipped in the app bundle. A mismatch means these drifted from
 * clio-schemas: re-copy them and update these hashes (#1549 G4 review —
 * `component_cases.json` had drifted this way once already).
 */
const CLIO_SCHEMAS_CHART_FIXTURE_HASHES: Record<string, string> = {
  'guard_cases.json': 'c21856e8a09f41654a588057a41a54150e8664be70442b7e4d09e02cda8bd069',
  'preset_cases.json': '2767c24e9773aa8e9b38da0c7c06a5aa06cb15254f20938d4212b7bf79cf230f',
  'selection_state_cases.json': '485f2f529f9695eb7957b421267596b86b8895a487b509c9ce3462cba662d3da',
  'component_cases.json': '25d44e61df49064a7242289fec27569b526a8666295be4ea87ae127a327f88d1',
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

  it.each(Object.entries(CLIO_SCHEMAS_CHART_FIXTURE_HASHES))(
    'pins shared fixture %s byte-for-byte from clio-schemas',
    (file, hash) => {
      const bytes = readFileSync(resolve(process.cwd(), 'src/test-fixtures/chart', file));
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

  it('never produces spec_invalid_encoding: JSON.stringify escapes a lone surrogate, unlike Python', () => {
    // The Python guard's `spec_invalid_encoding` (clio-schemas #1549 G4
    // review) exists because `str.encode("utf-8")` refuses a lone UTF-16
    // surrogate. `JSON.stringify` has no such failure mode: per the
    // "Well-Formed JSON.stringify" spec change, it escapes a lone surrogate
    // to literal `\uXXXX` text instead of passing it through, so the result
    // is always valid, encodable UTF-8. `spec_invalid_encoding` stays in
    // `ChartSpecViolationCode` only so a server-reported violation can still
    // render (see that type's doc comment) — `checkChartSpec` itself never
    // emits it, which this demonstrates rather than asserts away.
    const spec = { mark: 'point', description: '\ud800' };
    expect(JSON.stringify(spec)).toContain('\\ud800');
    expect(() => serializedSize(spec)).not.toThrow();
    expect(checkChartSpec(spec)).toEqual([]);
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
