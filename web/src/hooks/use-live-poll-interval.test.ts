import { describe, expect, it } from 'vitest';
import { LIVE_STREAM_FALLBACK_POLL_MS } from '@/lib/runtime-limits';
import { livePollInterval } from './use-live-poll-interval';

describe('livePollInterval', () => {
  it('polls at the requested cadence without a healthy stream', () => {
    expect(livePollInterval(1_500, false)).toBe(1_500);
  });

  it('falls back to a slow safety poll while the stream delivers', () => {
    expect(livePollInterval(1_500, true)).toBe(LIVE_STREAM_FALLBACK_POLL_MS);
    expect(livePollInterval(1_500, true, 10_000)).toBe(10_000);
  });

  it('never polls faster than requested', () => {
    expect(livePollInterval(60_000, true)).toBe(60_000);
  });
});
