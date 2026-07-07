/**
 * The web live stream listens for a subset of the machine-checked wire
 * vocabulary (iowarp/gact-tui#232, SPEC §7.7). LIVE_SSE_EVENT_TYPES drives
 * LiveReducer's compile-time-exhaustive dispatch registry, so it may cover
 * fewer types than the full wire union — but it must never name a type that
 * is not in the canonical WIRE_EVENT_TYPES (that would be a listener for an
 * event the contract does not define). This asserts LIVE_SSE_EVENT_TYPES ⊆
 * WIRE_EVENT_TYPES.
 */
import { WIRE_EVENT_TYPES } from '@clio/core';
import { describe, expect, it } from 'vitest';
import { LIVE_SSE_EVENT_TYPES } from '../../src/LiveConnectionConfig.js';

describe('LIVE_SSE_EVENT_TYPES is a subset of the wire vocabulary (#232)', () => {
  const wire = new Set<string>(WIRE_EVENT_TYPES);

  it('every live-listened type is in the canonical WIRE_EVENT_TYPES', () => {
    const extra = LIVE_SSE_EVENT_TYPES.filter((t) => !wire.has(t)).sort();
    expect(
      extra,
      `web listens for types absent from SPEC §7.7 / WIRE_EVENT_TYPES: ${extra.join(', ')}`,
    ).toEqual([]);
  });
});
