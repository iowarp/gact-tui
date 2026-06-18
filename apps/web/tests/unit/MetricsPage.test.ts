import { describe, expect, it } from 'vitest';
import {
  formatLatencyDetail,
  formatLatencyValue,
  latencyEntries,
} from '../../src/routes/discovery/MetricsPage.js';

describe('MetricsPage latency formatting', () => {
  it('keeps CLIO 0.5.3 latency buckets readable', () => {
    const bucket = { count: 12, p50_ms: 4.23, p95_ms: 18.71, max_ms: 31.44 };

    expect(formatLatencyValue(bucket)).toBe('p50 4.23ms');
    expect(formatLatencyDetail(bucket)).toBe('12 samples · p95 18.7ms · max 31.4ms');
  });

  it('filters null latency rows but preserves populated buckets', () => {
    expect(
      latencyEntries({
        'tool:shell_bash': { count: 1, p50_ms: 9 },
        empty: null,
      }),
    ).toEqual([['tool:shell_bash', { count: 1, p50_ms: 9 }]]);
  });
});
