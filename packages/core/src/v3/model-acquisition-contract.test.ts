import { describe, expect, it } from 'vitest';
import { modelRegistryCardStatusSchema } from './model-acquisition-contract.js';

describe('model registry card contract', () => {
  it('keeps completeness unknown when an older server omits the new card fields', () => {
    expect(modelRegistryCardStatusSchema.parse(undefined)).toBe('unknown');
  });
});
