import { describe, expect, it } from 'vitest';
import { modelFacts } from '@/test-fixtures/model-picker/capability-rows';
import { modelFactSummary } from './model-facts';
import {
  COST_SUBSCRIPTION_TOKEN,
  COST_UNPRICED_TOKEN,
  COST_VARIABLE_TOKEN,
  isRangeModifier,
  matchesActiveTokens,
  matchesRange,
  parseRangeToken,
  SIZE_ANY_TOKEN,
} from './model-range-tokens';

const facts = (spec: Parameters<typeof modelFacts>[1]) => modelFactSummary(modelFacts('m', spec));

describe('parseRangeToken', () => {
  it('reads sizes, prices and release windows', () => {
    expect(parseRangeToken('size:>32B')).toEqual({ kind: 'size', min: 32e9 });
    expect(parseRangeToken('size:<1b')).toEqual({ kind: 'size', max: 1e9 });
    expect(parseRangeToken('size:6B-12B')).toEqual({ kind: 'size', min: 6e9, max: 12e9 });
    expect(parseRangeToken('size:1.5T-2T')).toEqual({ kind: 'size', min: 1.5e12, max: 2e12 });
    expect(parseRangeToken('cost:<1')).toEqual({ kind: 'cost', max: 1 });
    expect(parseRangeToken('cost:0.1-2')).toEqual({ kind: 'cost', min: 0.1, max: 2 });
    expect(parseRangeToken('released:<6mo')).toEqual({ kind: 'released', amount: 6, unit: 'mo' });
    expect(parseRangeToken('released:<30d')).toEqual({ kind: 'released', amount: 30, unit: 'd' });
  });

  it('is not a range for anything else; the modifiers are their own kind', () => {
    for (const word of ['size:any', 'cost:variable', 'size:>32', 'size:12B-6B', 'cost:<x', 'released:>6mo', 'input:image', 'free']) {
      expect(parseRangeToken(word)).toBeUndefined();
    }
    expect([SIZE_ANY_TOKEN, COST_VARIABLE_TOKEN, COST_SUBSCRIPTION_TOKEN, COST_UNPRICED_TOKEN].every(isRangeModifier)).toBe(true);
    expect(isRangeModifier('size:known')).toBe(false);
  });
});

describe('matchesRange', () => {
  it('a size range means KNOWN to be that size; size:any lets unknown sizes in', () => {
    const range = parseRangeToken('size:>32B')!;
    expect(matchesRange(range, facts({ total: 70e9 }))).toBe(true);
    expect(matchesRange(range, facts({ total: 32e9 }))).toBe(true);
    expect(matchesRange(range, facts({ total: 8e9 }))).toBe(false);
    expect(matchesRange(range, facts({}))).toBe(false);
    expect(matchesRange(range, facts({}), new Set([SIZE_ANY_TOKEN]))).toBe(true);
    // size:any never lets a KNOWN size outside the range through.
    expect(matchesRange(range, facts({ total: 8e9 }), new Set([SIZE_ANY_TOKEN]))).toBe(false);
  });

  it('a cost range bounds metered prices; each other kind of price has its own modifier', () => {
    const range = parseRangeToken('cost:<1')!;
    expect(matchesRange(range, facts({ price: 0.15 }))).toBe(true);
    expect(matchesRange(range, facts({ price: 3 }))).toBe(false);
    for (const [price, modifier] of [
      ['variable', COST_VARIABLE_TOKEN],
      ['subscription', COST_SUBSCRIPTION_TOKEN],
      [undefined, COST_UNPRICED_TOKEN],
    ] as const) {
      const model = facts(price ? { price } : {});
      expect(matchesRange(range, model)).toBe(false);
      expect(matchesRange(range, model, new Set([modifier]))).toBe(true);
      const others = [COST_VARIABLE_TOKEN, COST_SUBSCRIPTION_TOKEN, COST_UNPRICED_TOKEN].filter((token) => token !== modifier);
      expect(matchesRange(range, model, new Set(others))).toBe(false);
    }
  });

  it('counts a release back from the service as-of day in calendar months; unknown never passes', () => {
    const range = parseRangeToken('released:<6mo')!;
    const asOf = '2026-09-26';
    expect(matchesRange(range, facts({ released: '2026-03-26', recent: true, asOf }))).toBe(true);
    expect(matchesRange(range, facts({ released: '2026-03-25', recent: false, asOf }))).toBe(false);
    expect(matchesRange(range, facts({ recent: false, asOf }))).toBe(false);
  });
});

describe('matchesActiveTokens', () => {
  it('ANDs membership tokens with range tokens, widened by the active modifiers', () => {
    const big = facts({ total: 70e9, released: '2026-08-01', recent: true });
    const carried = new Set(['input:image']);
    expect(matchesActiveTokens(carried, big, ['input:image', 'size:>32B', 'released:<6mo'])).toBe(true);
    expect(matchesActiveTokens(carried, big, ['input:image', 'size:<12B'])).toBe(false);
    expect(matchesActiveTokens(carried, big, ['input:pdf', 'size:>32B'])).toBe(false);

    const unknown = facts({ released: '2026-08-01', recent: true });
    expect(matchesActiveTokens(new Set(), unknown, ['size:>32B'])).toBe(false);
    expect(matchesActiveTokens(new Set(), unknown, ['size:>32B', SIZE_ANY_TOKEN])).toBe(true);
    // A modifier alone filters nothing.
    expect(matchesActiveTokens(new Set(), unknown, [SIZE_ANY_TOKEN, COST_VARIABLE_TOKEN])).toBe(true);
  });
});
