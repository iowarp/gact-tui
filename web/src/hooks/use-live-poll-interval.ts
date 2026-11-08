import { LIVE_STREAM_FALLBACK_POLL_MS } from '@/lib/runtime-limits';
import { useLiveStore } from '@/store/live-store';

/** True while a focused-session stream is open and delivering frames. */
export function useLiveStreamHealthy(): boolean {
  return useLiveStore((state) => state.streamOwners > 0 && state.entities.stream === 'live');
}

/**
 * A poll cadence that yields to the live stream: `pollMs` while no stream is
 * delivering, a slow fallback while one is (its events invalidate the read).
 * Never shorter than the cadence asked for.
 */
export function livePollInterval(
  pollMs: number,
  streamHealthy: boolean,
  fallbackMs: number = LIVE_STREAM_FALLBACK_POLL_MS,
): number {
  return streamHealthy ? Math.max(pollMs, fallbackMs) : pollMs;
}
