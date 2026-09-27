import { describe, expect, it } from 'vitest';
import { capabilityRow, modelFacts } from '@/test-fixtures/model-picker/capability-rows';
import { modelCapabilityTagLabel, modelCapabilityTagMeaning, modelCapabilityTagsFromOption } from './model-capability-tags';
import {
  earliestDay,
  formatParameterCount,
  formatPricePer1m,
  modelFactSummary,
  parameterSizeLabel,
} from './model-facts';
import { tagFilterToken } from './model-filter-tokens';

describe('modelFactSummary', () => {
  it('normalizes each stated fact and leaves unstated ones absent', () => {
    const summary = modelFactSummary(
      modelFacts('openrouter/pareto-code', {
        description: 'Routes by Artificial Analysis.',
        links: [{ text: 'Artificial Analysis', url: 'https://artificialanalysis.ai/' }],
        released: '2026-04-21',
        recent: true,
        price: 0.15,
        total: 35_951_822_704,
      }),
    );
    expect(summary.description?.links[0]?.url).toBe('https://artificialanalysis.ai/');
    expect(summary.releasedOn?.toISOString().slice(0, 10)).toBe('2026-04-21');
    expect(summary.recent).toBe(true);
    expect(summary.asOf?.toISOString().slice(0, 10)).toBe('2026-09-26');
    expect(summary.inputPrice).toEqual({ kind: 'usd', per1m: 0.15 });
    expect(summary.parameters?.total).toBe(35_951_822_704);
    expect(modelFactSummary(modelFacts('x', {}))).toEqual({});
    expect(modelFactSummary(undefined)).toEqual({});
  });

  it('keeps a variable or subscription price a kind, never a number', () => {
    expect(modelFactSummary(modelFacts('x', { price: 'variable' })).inputPrice).toEqual({ kind: 'variable' });
    expect(modelFactSummary(modelFacts('x', { price: 'subscription' })).inputPrice).toEqual({ kind: 'subscription' });
  });
});

describe('formatting', () => {
  it('says sizes and prices as people do', () => {
    expect(formatParameterCount(70_553_706_496)).toBe('70B');
    expect(formatParameterCount(7_615_616_512)).toBe('7.6B');
    expect(formatParameterCount(1_000_000_000_000)).toBe('1T');
    expect(formatParameterCount(350_000_000)).toBe('350M');
    expect(parameterSizeLabel({ total: 30e9, active: 3e9, rounded: false })).toBe('A3B / 30B');
    expect(parameterSizeLabel({ total: 70e9, rounded: false })).toBe('70B');
    expect(parameterSizeLabel({ active: 3e9, rounded: false })).toBeUndefined();
    expect(formatPricePer1m(0)).toBe('Free');
    expect(formatPricePer1m(0.15)).toBe('$0.15');
    expect(formatPricePer1m(15)).toBe('$15');
  });

  it('reads a month-precision date as its first day', () => {
    expect(earliestDay('2026-02')?.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(earliestDay('nope')).toBeUndefined();
  });
});

describe('fact tags on a row', () => {
  it('a recent release and the size read as tags; Recent filters by released:<6mo', () => {
    const row = capabilityRow('qwen/qwen3-30b-a3b', {}, {
      modelFacts: modelFacts('qwen/qwen3-30b-a3b', { recent: true, released: '2026-08-01', total: 30e9, active: 3e9, price: 0.2 }),
    });
    const tags = modelCapabilityTagsFromOption(row);
    const recent = tags.find((tag) => tag.axis === 'recent')!;
    const size = tags.find((tag) => tag.axis === 'size')!;
    expect(modelCapabilityTagLabel(recent)).toBe('Recent');
    expect(tagFilterToken(recent)).toBe('released:<6mo');
    expect(modelCapabilityTagLabel(size)).toBe('A3B / 30B');
    expect(modelCapabilityTagMeaning(size)).toBe('A mixture of experts: 3B parameters active per token, of 30B in all.');
    expect(tagFilterToken(size)).toBeUndefined();
    // No cost tag other than Free.
    expect(tags.some((tag) => tag.axis === 'price')).toBe(false);
  });

  it('an old release and an unknown size give no tags', () => {
    const row = capabilityRow('old/model', {}, { modelFacts: modelFacts('old/model', { recent: false, released: '2024-01-01' }) });
    const axes = modelCapabilityTagsFromOption(row).map((tag) => tag.axis);
    expect(axes).not.toContain('recent');
    expect(axes).not.toContain('size');
  });
});
