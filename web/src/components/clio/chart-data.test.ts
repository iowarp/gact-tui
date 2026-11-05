import { describe, expect, it } from 'vitest';
import { chartQueryColumns, sourceColumn, specFieldNames } from './chart-data';

describe('specFieldNames', () => {
  it('reads the source column of an escaped or nested Vega-Lite field', () => {
    expect(sourceColumn('condition\\.arm_length_m')).toBe('condition.arm_length_m');
    expect(sourceColumn('geometry.coordinates')).toBe('geometry');
    expect(sourceColumn('a\\[0\\]')).toBe('a[0]');
    expect(
      specFieldNames({
        layer: [
          { encoding: { x: { field: 'condition\\.arm_length_m' }, y: { field: 'value' } } },
          { encoding: { y: { field: 'law_value' } } },
        ],
      }),
    ).toEqual(['condition.arm_length_m', 'value', 'law_value']);
  });
});

describe('chartQueryColumns', () => {
  const folded = {
    transform: [{ fold: ['nozzle_c', 'bed_c'], as: ['sensor', 'temp_c'] }],
    mark: 'line',
    encoding: {
      x: { field: 't', type: 'temporal' },
      y: { field: 'temp_c', type: 'quantitative' },
      color: { field: 'sensor', type: 'nominal' },
    },
  };

  it('asks for every column when the spec computes its own (a fold reads columns it never names)', () => {
    // SABOTAGE: drop the transform check and the authored encoding's fields
    // (temp_c, sensor) are requested, which the source does not have.
    expect(chartQueryColumns([], folded, ['t', 'temp_c', 'sensor'])).toEqual([]);
    expect(chartQueryColumns([], { layer: [folded] }, ['t'])).toEqual([]);
  });

  it('keeps the producer projection and projects a spec without transforms', () => {
    expect(chartQueryColumns(['t', 'nozzle_c'], folded, [])).toEqual(['t', 'nozzle_c']);
    const plain = { mark: 'line', encoding: { x: { field: 't' }, y: { field: 'progress' } } };
    expect(chartQueryColumns([], plain, ['t'])).toEqual(['t', 'progress']);
  });
});
