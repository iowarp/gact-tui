import { describe, expect, it } from 'vitest';
import {
  defaultReasoningLabel,
  modelDefaultLabel,
  modelReasoningLevels,
  REASONING_EFFORT_LABELS,
} from './reasoning-levels';

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

  it('offers a codex model reporting max/ultra efforts (#1436) with a real label', () => {
    const codex = modelReasoningLevels({
      levels: ['medium', 'high', 'xhigh', 'max', 'ultra'],
      default: 'ultra',
      default_source: 'provider',
    });
    expect(codex?.levels).toEqual(['medium', 'high', 'xhigh', 'max', 'ultra']);
    expect(modelDefaultLabel(codex)).toBe('Model default (Ultra)');
    expect(REASONING_EFFORT_LABELS.ultra).toBe('Ultra');
  });
});
