import { describe, expect, it } from 'vitest';
import { defaultReasoningLabel, modelDefaultLabel, modelReasoningLevels } from './reasoning-levels';

describe('default labels', () => {
  it('never calls CLIO\'s shipped default "the model default"', () => {
    const sonnet = modelReasoningLevels({
      levels: ['off', 'low', 'medium', 'high', 'xhigh', 'max'],
      default: 'low',
      default_source: 'clio_shipped',
    });
    expect(modelDefaultLabel(sonnet)).toBe('Default (Low)');
    expect(defaultReasoningLabel(undefined, sonnet)).toBe('Default (Low)');
  });

  it("names the model's own default as such", () => {
    const opus = modelReasoningLevels({
      levels: ['off', 'low', 'medium', 'high'],
      default: 'high',
      default_source: 'provider',
    });
    expect(modelDefaultLabel(opus)).toBe('Model default (High)');
  });
});
