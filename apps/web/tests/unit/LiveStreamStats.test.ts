import { describe, expect, it } from 'vitest';
import { createStreamStatsTracker } from '../../src/LiveStreamStats.js';
import type { StreamStats } from '../../src/LiveStreamStats.js';

function makeTracker() {
  let timestamp = 0;
  let stats: StreamStats | null = null;
  const tracker = createStreamStatsTracker(
    (next) => {
      stats = typeof next === 'function' ? next(stats) : next;
    },
    () => timestamp,
  );

  return {
    tracker,
    at(ms: number) {
      timestamp = ms;
    },
    get stats() {
      return stats;
    },
  };
}

describe('createStreamStatsTracker', () => {
  it('starts timing on the user message and measures batch TTFT/rate', () => {
    const h = makeTracker();
    h.at(1000);
    h.tracker.track({ type: 'message.created', payload: { role: 'user' } });
    expect(h.stats).toEqual({ ttftMs: null, tokensPerSec: null, streaming: true });

    h.at(1500);
    h.tracker.track({ type: 'message.part.added', payload: {} });
    expect(h.stats).toEqual({ ttftMs: 500, tokensPerSec: null, streaming: true });

    h.at(3000);
    h.tracker.track({
      type: 'message.completed',
      payload: { tokens: { output: 120 } },
    });
    expect(h.stats).toEqual({ ttftMs: 500, tokensPerSec: 60, streaming: false });
  });

  it('updates live token-rate estimates from text deltas before completion', () => {
    const h = makeTracker();
    h.at(1000);
    h.tracker.track({ type: 'message.created', payload: { role: 'user' } });

    h.at(1300);
    h.tracker.track({
      type: 'message.part.delta',
      payload: { delta: { text_append: 'abcdefghijklmnop' } },
    });
    expect(h.stats).toEqual({ ttftMs: 300, tokensPerSec: null, streaming: true });

    h.at(1800);
    h.tracker.track({
      type: 'message.part.delta',
      payload: { delta: { text_append: 'abcdefghijklmnop' } },
    });
    expect(h.stats).toEqual({ ttftMs: 300, tokensPerSec: 16, streaming: true });
  });

  it('ignores same-instant user parts and clears replay bursts', () => {
    const h = makeTracker();
    h.at(1000);
    h.tracker.track({ type: 'message.created', payload: { role: 'user' } });

    h.at(1020);
    h.tracker.track({ type: 'message.part.added', payload: {} });
    expect(h.stats).toEqual({ ttftMs: null, tokensPerSec: null, streaming: true });

    h.at(1200);
    h.tracker.track({ type: 'message.completed', payload: { tokens: { output: 10 } } });
    expect(h.stats).toBeNull();
  });

  it('resets per-session state explicitly', () => {
    const h = makeTracker();
    h.at(1000);
    h.tracker.track({ type: 'message.created', payload: { role: 'user' } });
    h.tracker.reset();

    h.at(2000);
    h.tracker.track({ type: 'message.part.added', payload: {} });
    expect(h.stats).toBeNull();
  });
});
