/**
 * Tracks per-turn streaming performance (time-to-first-token, output
 * tokens/sec) from the live SSE stream for the topbar stats readout.
 */
import type { Setter } from 'solid-js';

/** Streaming performance of the most recent turn (W3 Tier-2). */
export interface StreamStats {
  /** Time from user message.created → first assistant content, in ms. */
  ttftMs: number | null;
  /** Output token rate. Live deltas use a ~4-chars/token estimate; completion
   * recomputes from clio's real tokens.output count. */
  tokensPerSec: number | null;
  /** True while the turn is still streaming. */
  streaming: boolean;
}

export interface StreamStatsTracker {
  reset: () => void;
  track: (ev: { type?: string; payload?: Record<string, unknown> }) => void;
}

export function createStreamStatsTracker(
  setStreamStats: Setter<StreamStats | null>,
  now: () => number = () => performance.now(),
): StreamStatsTracker {
  let turnStartedAt = 0;
  let firstContentAt = 0;
  let deltaChars = 0;

  function reset() {
    setStreamStats(null);
    turnStartedAt = 0;
    firstContentAt = 0;
    deltaChars = 0;
  }

  function track(ev: { type?: string; payload?: Record<string, unknown> }) {
    const p = ev.payload ?? {};
    switch (ev.type) {
      case 'message.created': {
        // The clock starts at the USER message — that's the latency the
        // human actually experiences. Anchoring on assistant creation reads
        // ~0ms in batch mode because clio creates assistant message + parts
        // together at the end of the turn.
        if ((p['role'] as string) === 'user') {
          turnStartedAt = now();
          firstContentAt = 0;
          deltaChars = 0;
          setStreamStats({ ttftMs: null, tokensPerSec: null, streaming: true });
        }
        break;
      }
      case 'message.part.added':
      case 'message.part.delta': {
        if (!turnStartedAt) break;
        const timestamp = now();
        // Only assistant content counts. Part payloads don't carry a role,
        // so the user message's own part, arriving at the same instant as
        // message.created, is filtered with a 50ms guard.
        if (timestamp - turnStartedAt < 50) break;
        if (!firstContentAt) {
          firstContentAt = timestamp;
          setStreamStats({
            ttftMs: Math.round(firstContentAt - turnStartedAt),
            tokensPerSec: null,
            streaming: true,
          });
        }
        if (ev.type === 'message.part.delta') {
          const delta = (p['delta'] as { text_append?: string }) ?? {};
          deltaChars += (delta.text_append ?? '').length;
          const elapsedSec = (timestamp - firstContentAt) / 1000;
          if (elapsedSec > 0.25) {
            setStreamStats((s) => ({
              ttftMs: s?.ttftMs ?? null,
              tokensPerSec: Math.round(deltaChars / 4 / elapsedSec),
              streaming: true,
            }));
          }
        }
        break;
      }
      case 'message.completed': {
        if (!turnStartedAt) break;
        const tokens = p['tokens'] as { output?: number } | undefined;
        const end = now();
        const turnSec = (end - turnStartedAt) / 1000;
        // Sub-300ms "turns" are SSE replay bursts, not real generation.
        if (turnSec < 0.3) {
          reset();
          break;
        }
        setStreamStats({
          ttftMs: firstContentAt
            ? Math.round(firstContentAt - turnStartedAt)
            : Math.round(end - turnStartedAt),
          tokensPerSec: tokens?.output ? Math.round(tokens.output / turnSec) : null,
          streaming: false,
        });
        turnStartedAt = 0;
        break;
      }
    }
  }

  return { reset, track };
}
