import { describe, expect, it } from 'vitest';
import {
  costStops,
  numericRangeToken,
  numericSliderValue,
  releasedSliderValue,
  RELEASED_STOPS,
  replaceRangeToken,
  SIZE_STOPS,
} from './model-range-scales';

const last = SIZE_STOPS.length - 1;

describe('size slider <-> token', () => {
  it('writes no token at both ends, an open bound at one end, a span otherwise', () => {
    expect(numericRangeToken('size', SIZE_STOPS, [0, last])).toBeUndefined();
    expect(numericRangeToken('size', SIZE_STOPS, [3, last])).toBe('size:>32B');
    expect(numericRangeToken('size', SIZE_STOPS, [0, 2])).toBe('size:<12B');
    expect(numericRangeToken('size', SIZE_STOPS, [1, 4])).toBe('size:6B-128B');
  });

  it('reads the slider position back from a (typed) token', () => {
    expect(numericSliderValue('size', SIZE_STOPS, ['size:>32B'])).toEqual([3, last]);
    expect(numericSliderValue('size', SIZE_STOPS, ['size:6b-128b'])).toEqual([1, 4]);
    // A value between stops lands on the nearest one.
    expect(numericSliderValue('size', SIZE_STOPS, ['size:>30B'])).toEqual([3, last]);
    expect(numericSliderValue('size', SIZE_STOPS, ['input:image'])).toEqual([0, last]);
  });
});

describe('costStops', () => {
  it('runs from free to the top price the catalog states', () => {
    const stops = costStops(12);
    expect(stops[0]).toMatchObject({ value: 0, label: 'Free' });
    expect(stops.at(-1)).toMatchObject({ value: 12, label: '$12' });
    expect(stops.every((stop, index) => index === 0 || stop.value > stops[index - 1]!.value)).toBe(true);
    expect(costStops(360000).at(-1)?.label).toBe('$360K');
    expect(numericRangeToken('cost', stops, [0, stops.findIndex((stop) => stop.value === 1)])).toBe('cost:<1');
  });
});

describe('released slider', () => {
  it('maps the tokens it writes back to their stop, and "All" to no token', () => {
    RELEASED_STOPS.forEach((stop, index) => {
      expect(releasedSliderValue(stop.token ? [stop.token] : [])).toBe(index);
    });
    expect(RELEASED_STOPS.at(-1)?.token).toBeUndefined();
  });
});

describe('replaceRangeToken', () => {
  it('keeps one range per kind and drops its modifiers when widened out', () => {
    expect(replaceRangeToken(['input:text', 'size:>32B'], 'size', 'size:>128B')).toEqual(['input:text', 'size:>128B']);
    expect(replaceRangeToken(['size:>32B', 'size:any', 'cost:<1'], 'size', undefined)).toEqual(['cost:<1']);
    expect(replaceRangeToken(['size:>32B', 'size:any'], 'size', 'size:<12B')).toEqual(['size:any', 'size:<12B']);
    expect(
      replaceRangeToken(['cost:<1', 'cost:variable', 'cost:unpriced', 'size:any'], 'cost', undefined),
    ).toEqual(['size:any']);
    expect(replaceRangeToken(['released:<1y'], 'released', 'released:<6mo')).toEqual(['released:<6mo']);
  });
});
