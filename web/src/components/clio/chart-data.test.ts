import { describe, expect, it } from 'vitest';
import { sourceColumn, specFieldNames } from './chart-data';

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
