import { describe, expect, it } from 'vitest';
import { MODEL_CHOICE_SOURCE } from './flow-run-usage';

describe('MODEL_CHOICE_SOURCE', () => {
  it('names a model the person picked for the child', () => {
    expect(MODEL_CHOICE_SOURCE.person).toBe('chosen by you');
  });
});
