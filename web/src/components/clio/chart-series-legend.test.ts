import { describe, expect, it } from 'vitest';
import { withSeriesLegend } from './chart-series-legend';

const spec = {
  encoding: { color: { field: 'storm', legend: null, type: 'nominal' } },
  mark: 'line',
};

describe('small series legend default', () => {
  it('names a few curves without changing the source spec', () => {
    const result = withSeriesLegend(spec, [{ storm: 'A' }, { storm: 'B' }], 'trajectories', 'storm', undefined);
    expect(result.visible).toBe(true);
    expect(result.spec.encoding).toMatchObject({ color: { legend: { title: 'storm' } } });
    expect(spec.encoding.color.legend).toBeNull();
  });

  it('keeps dense curves free of an oversized legend', () => {
    const rows = Array.from({ length: 9 }, (_, index) => ({ storm: `Storm ${index}` }));
    expect(withSeriesLegend(spec, rows, 'trajectories', 'storm', undefined)).toEqual({ spec, visible: false });
  });

  it('does not override an authored chart or explicit color field', () => {
    expect(withSeriesLegend(spec, [{ storm: 'A' }, { storm: 'B' }], undefined, 'storm', undefined).spec).toBe(spec);
    expect(withSeriesLegend(spec, [{ storm: 'A' }, { storm: 'B' }], 'spectra', 'storm', 'group').spec).toBe(spec);
  });
});
