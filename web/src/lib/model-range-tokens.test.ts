import { describe, expect, it } from 'vitest';
import { modelFacts } from '@/test-fixtures/model-picker/capability-rows';
import { modelFactSummary } from './model-facts';
import {
  COST_METERED_TOKEN,
  factTokens,
  matchesActiveTokens,
  matchesRange,
  parseRangeToken,
  SIZE_KNOWN_TOKEN,
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

  it('is not a range for anything else', () => {
    for (const word of ['size:known', 'cost:metered', 'size:>32', 'size:12B-6B', 'cost:<x', 'released:>6mo', 'input:image', 'free']) {
      expect(parseRangeToken(word)).toBeUndefined();
    }
  });
});

describe('matchesRange', () => {
  it('bounds a size inclusively; an unknown size passes (the toggle decides)', () => {
    const range = parseRangeToken('size:>32B')!;
    expect(matchesRange(range, facts({ total: 70e9 }))).toBe(true);
    expect(matchesRange(range, facts({ total: 32e9 }))).toBe(true);
    expect(matchesRange(range, facts({ total: 8e9 }))).toBe(false);
    expect(matchesRange(range, facts({}))).toBe(true);
  });

  it('bounds the input price; a variable or unstated price passes', () => {
    const range = parseRangeToken('cost:<1')!;
    expect(matchesRange(range, facts({ price: 0.15 }))).toBe(true);
    expect(matchesRange(range, facts({ price: 3 }))).toBe(false);
    expect(matchesRange(range, facts({ price: 'variable' }))).toBe(true);
    expect(matchesRange(range, facts({ price: 'subscription' }))).toBe(true);
    expect(matchesRange(range, facts({}))).toBe(true);
  });

  it('counts a release back from the service as-of day in calendar months; unknown never passes', () => {
    const range = parseRangeToken('released:<6mo')!;
    const asOf = '2026-09-26';
    expect(matchesRange(range, facts({ released: '2026-03-26', recent: true, asOf }))).toBe(true);
    expect(matchesRange(range, facts({ released: '2026-03-25', recent: false, asOf }))).toBe(false);
    expect(matchesRange(range, facts({ recent: false, asOf }))).toBe(false);
  });
});

describe('factTokens / matchesActiveTokens', () => {
  it('gives size:known and cost:metered only for stated values', () => {
    expect(factTokens(facts({ total: 7e9, price: 0 }))).toEqual([SIZE_KNOWN_TOKEN, COST_METERED_TOKEN]);
    expect(factTokens(facts({ price: 'variable' }))).toEqual([]);
  });

  it('ANDs membership tokens with range tokens', () => {
    const big = facts({ total: 70e9, released: '2026-08-01', recent: true });
    const carried = new Set(['input:image', ...factTokens(big)]);
    expect(matchesActiveTokens(carried, big, ['input:image', 'size:>32B', 'released:<6mo'])).toBe(true);
    expect(matchesActiveTokens(carried, big, ['input:image', 'size:<12B'])).toBe(false);
    expect(matchesActiveTokens(carried, big, ['input:pdf', 'size:>32B'])).toBe(false);
    // Unknown size passes a size range until size:known is asked for.
    const unknown = facts({ released: '2026-08-01', recent: true });
    expect(matchesActiveTokens(new Set(), unknown, ['size:>32B'])).toBe(true);
    expect(matchesActiveTokens(new Set(), unknown, ['size:>32B', SIZE_KNOWN_TOKEN])).toBe(false);
  });
});
