import { describe, expect, it } from 'vitest';
import { fleetSettingsSchema } from './system-repository.js';

describe('Fleet capability compatibility', () => {
  it('preserves an older service response without inventing a search setting', () => {
    const legacy = { revision: 'r1', judges: { goals: null, variants: null, permissions: null } };
    expect(fleetSettingsSchema.parse(legacy)).toEqual(legacy);
    expect(fleetSettingsSchema.parse(legacy)).not.toHaveProperty('search');
  });
  it('distinguishes supported search inheriting a model from an older service', () => {
    const current = {
      revision: 'r2',
      judges: { goals: null, variants: null, permissions: null },
      search: null,
    };
    expect(fleetSettingsSchema.parse(current)).toEqual(current);
  });
  it('keeps the SPOTTER default model and preserves its absence on an older service', () => {
    const current = {
      revision: 'r3',
      judges: { goals: null, variants: null, permissions: null },
      spotter: { provider_id: 'server-vllm-spotter', model_id: 'qwen3' },
    };
    expect(fleetSettingsSchema.parse(current)).toEqual(current);
    expect(fleetSettingsSchema.parse({ ...current, spotter: null }).spotter).toBeNull();
    const { spotter: _spotter, ...legacy } = current;
    expect(fleetSettingsSchema.parse(legacy)).not.toHaveProperty('spotter');
  });
  it('keeps the fast model, its automatic null, and its absence on an older service', () => {
    const current = {
      revision: 'r4',
      judges: { goals: null, variants: null, permissions: null },
      fast: { provider_id: 'claude_code', model_id: 'claude-haiku-4-5' },
    };
    expect(fleetSettingsSchema.parse(current)).toEqual(current);
    expect(fleetSettingsSchema.parse({ ...current, fast: null }).fast).toBeNull();
    const { fast: _fast, ...legacy } = current;
    expect(fleetSettingsSchema.parse(legacy)).not.toHaveProperty('fast');
  });
});
