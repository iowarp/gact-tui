import { describe, expect, it } from 'vitest';
import { chartCategoryDomains, withChartCategoryColors } from './chart-category-colors';
import { mapCategoryColors } from './map-category-palette';
import { chartSideLegendSpace } from './chart-presentation';

const spec = { mark: 'point', encoding: { color: { field: 'region', type: 'nominal' } } };
const rows = [{ region: 'Hill' }, { region: 'Downtown' }, { region: 'Elsewhere' }];

describe('shared categorical identity', () => {
  it('reserves side space for authored legends in layers while defaults use the full width', () => {
    expect(chartSideLegendSpace(spec)).toBe(0);
    expect(
      chartSideLegendSpace({
        layer: [
          { ...spec, encoding: { color: { ...spec.encoding.color, legend: { orient: 'right' } } } },
        ],
      }),
    ).toBe(112);
    expect(chartSideLegendSpace({ ...spec, config: { legend: { orient: 'left' } } })).toBe(112);
    expect(
      chartSideLegendSpace({
        ...spec,
        config: { legend: { orient: 'left' } },
        encoding: { color: { ...spec.encoding.color, legend: null } },
      }),
    ).toBe(0);
  });
  it('keeps a map category unchanged when earlier categories disappear or new ones arrive', () => {
    const all = mapCategoryColors(rows.map((row) => ({ category: row.region })));
    const subset = mapCategoryColors([{ category: 'Hill' }]);
    const extended = mapCategoryColors([{ category: 'A new category' }, { category: 'Hill' }]);
    expect(all.get('Hill')).toBe(subset.get('Hill'));
    expect(extended.get('Hill')).toBe(subset.get('Hill'));
  });

  it('uses the same category identities in chart layers and map subsets without mutating the source', () => {
    const layered = { layer: [spec, { mark: { type: 'text', color: 'red' } }] };
    const prepared = withChartCategoryColors(layered, chartCategoryDomains(layered, rows));
    const scale = (
      (prepared.layer as (typeof spec)[])[0]!.encoding.color as unknown as {
        scale: { domain: string[]; range: string[] };
      }
    ).scale;
    const map = mapCategoryColors([{ category: 'Hill' }, { category: 'Downtown' }]);
    for (const category of map.keys())
      expect(scale.range[scale.domain.indexOf(category)]).toBe(map.get(category));
    expect(layered.layer[0]).toBe(spec);
    expect(prepared.layer).toEqual([
      expect.objectContaining({ encoding: expect.anything() }),
      layered.layer[1],
    ]);
  });

  it.each([
    { range: ['gold', 'teal'] },
    { scheme: 'tableau10' },
    { domain: ['Hill', 'Downtown'] },
    null,
  ])('retains authored scales including disabled colour scales: %s', (scale) => {
    const authored = { ...spec, encoding: { color: { ...spec.encoding.color, scale } } };
    expect(withChartCategoryColors(authored, chartCategoryDomains(authored, rows))).toBe(authored);
  });

  it('retains an authored config palette and quantitative or ordered encodings', () => {
    const authored = { ...spec, config: { range: { category: ['gold', 'teal'] } } };
    expect(chartCategoryDomains(authored, rows)).toEqual({});
    for (const type of ['quantitative', 'ordinal', 'temporal']) {
      expect(
        chartCategoryDomains(
          { ...spec, encoding: { color: { ...spec.encoding.color, type } } },
          rows,
        ),
      ).toEqual({});
    }
  });
});
