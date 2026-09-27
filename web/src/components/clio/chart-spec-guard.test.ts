import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import guardCases from '@/test-fixtures/chart/guard_cases.json';
import {
  CHART_SPEC_RULES,
  CHART_SPEC_RULES_SUPPORTED_VERSION,
  checkChartSpec,
  countViews,
  serializedSize,
  specDepth,
} from './chart-spec-guard';

/**
 * `clio-schemas` 0.5.0 `HASHES.json` entries for the chart resources this
 * renderer vendors. A mismatch means the copies drifted from the source of
 * truth: re-copy them from `schemas/a2ui/chart/` and update these hashes.
 */
const CLIO_SCHEMAS_CHART_HASHES: Record<string, string> = {
  'guard_rules.json': 'd8cfd372ce76c79a5027bb383cf90946d5a417269bd881065ebb57efd74c6f2b',
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
});
