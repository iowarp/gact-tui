import type { ContextSnapshot } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { contextComposition } from './context-composition-model';

const context: ContextSnapshot = {
  session_id: 's',
  used_tokens: 100,
  used_tokens_source: 'provider',
  limit_tokens: 1000,
  autocompact_pct: 0.85,
  provenance: { source: 'server', stale: false, observed_at: '2026-10-21T06:00:00Z' },
  prompt_breakdown: {
    method: 'characters_div_4',
    tokens_estimated: 80,
    media_items: 0,
    sections: [{ id: 'messages', label: 'Messages', tokens_estimated: 80, count: 1, items: [] }],
  },
};
describe('context accounting presentation', () => {
  it('preserves immutable server data across rerenders and leaves unknown usage unattributed', () => {
    const original = structuredClone(context);
    const first = contextComposition(context, []);
    const second = contextComposition(context, []);
    expect(context).toEqual(original);
    expect(first.sections).toEqual(second.sections);
    expect(first.sections.at(-1)).toMatchObject({
      label: 'Unattributed prompt',
      tokens_estimated: 20,
    });
    expect(first.used + first.reserve + first.free).toBe(1000);
  });
  it('does not invent free capacity when the limit is unknown', () => {
    const value = contextComposition({ ...context, limit_tokens: undefined }, []);
    expect(value.limit).toBe(0);
    expect(value.reserve).toBe(0);
    expect(value.free).toBe(0);
  });
  it('makes headroom available when automatic compaction is disabled', () => {
    const value = contextComposition({ ...context, autocompact_enabled: false }, []);
    expect(value.reserve).toBe(0);
    expect(value.free).toBe(900);
  });
});
