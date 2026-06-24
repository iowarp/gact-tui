/**
 * UI component: Memory Health Readout.
 */
import { Show } from 'solid-js';
import type { MemoryStats, SessionMemoryStats } from '@clio/core';
import { formatCount, formatPercentage } from '../formatters.js';
import { THRESHOLD_TONES, thresholdTone, type PressureTone } from '../statusTones.js';
import './memory-health-readout.css';

export type { PressureTone };

/**
 * Fraction [0..1] of the session's context budget currently consumed. Prefers
 * the backend-reported `token_pressure`; falls back to retained/budget when the
 * backend only ships raw token counts. Returns null when nothing is knowable
 * (unbounded budget and no explicit pressure) — the bar is then hidden.
 */
export function tokenPressureFraction(s?: SessionMemoryStats): number | null {
  if (!s) return null;
  if (typeof s.token_pressure === 'number') {
    return Math.max(0, Math.min(1, s.token_pressure));
  }
  const budget = s.tokens_budget;
  const retained = s.tokens_retained;
  if (typeof budget === 'number' && budget > 0 && typeof retained === 'number') {
    return Math.max(0, Math.min(1, retained / budget));
  }
  return null;
}

/**
 * Maps the budget pressure to a design-token tone. Prefers the backend's
 * coarse `threshold_state` bucket (clio drift field); otherwise derives a
 * bucket from the fraction (warn ≥ 0.75, err ≥ 0.9) like the TUI.
 */
export function pressureTone(s?: SessionMemoryStats, fraction?: number | null): PressureTone {
  if (s?.threshold_state && s.threshold_state in THRESHOLD_TONES) {
    return thresholdTone(s.threshold_state);
  }
  if (fraction == null) return 'idle';
  if (fraction >= 0.9) return 'err';
  if (fraction >= 0.75) return 'warn';
  return 'ok';
}

function cacheHitTone(hitRate: number): PressureTone {
  if (hitRate >= 0.7) return 'ok';
  if (hitRate >= 0.4) return 'warn';
  return 'err';
}

/**
 * Compact memory-health readout: cache hit-rate chip + (when a session is
 * supplied) a context-budget pressure bar. Surfaces the SPEC §6.19 session
 * signals the TUI shows (token pressure / budget) that the web previously
 * dropped. Pure presentational — the caller owns fetching `MemoryStats`.
 */
export function MemoryHealthReadout(props: { stats?: MemoryStats }) {
  const cache = () => props.stats?.cache;
  const session = () => props.stats?.session;
  const fraction = () => tokenPressureFraction(session());
  const tone = () => pressureTone(session(), fraction());

  return (
    <Show when={props.stats}>
      <div class="mem-health" data-testid="memory-health">
        <Show when={cache()}>
          {(c) => (
            <div
              class={'mem-health__chip mem-health__chip--' + cacheHitTone(c().hit_rate)}
              data-testid="memory-health-cache"
              title={`${c().hits} hits · ${c().misses} misses`}
            >
              <span class="mem-health__chip-label">cache</span>
              <span class="mem-health__chip-value">{formatPercentage(c().hit_rate)}%</span>
            </div>
          )}
        </Show>
        <Show when={session()}>
          {(s) => (
            <div class="mem-health__pressure" data-testid="memory-health-pressure">
              <div class="mem-health__pressure-head">
                <span class="mem-health__chip-label">context</span>
                <Show when={s().threshold_state} fallback={<span class="mem-health__chip-value">
                  {fraction() == null ? '—' : `${Math.round((fraction() ?? 0) * 100)}%`}
                </span>}>
                  <span
                    class={'mem-health__state mem-health__state--' + tone()}
                    data-testid="memory-health-state"
                  >
                    {s().threshold_state}
                  </span>
                </Show>
              </div>
              <Show when={fraction() != null}>
                <div class="mem-health__bar" role="progressbar"
                  aria-valuenow={Math.round((fraction() ?? 0) * 100)}
                  aria-valuemin={0} aria-valuemax={100}>
                  <div
                    class={'mem-health__bar-fill mem-health__bar-fill--' + tone()}
                    style={`width:${Math.round((fraction() ?? 0) * 100)}%`}
                  />
                </div>
              </Show>
              <Show when={typeof s().tokens_retained === 'number'}>
                <div class="mem-health__sub">
                  {formatCount(s().tokens_retained!)}
                  <Show when={typeof s().tokens_budget === 'number'} fallback={<> tokens</>}>
                    {' / ' + formatCount(s().tokens_budget as number)} tokens
                  </Show>
                </div>
              </Show>
              <Show when={s().compaction_recommended}>
                <div class="mem-health__hint" data-testid="memory-health-compact">
                  compaction recommended
                </div>
              </Show>
            </div>
          )}
        </Show>
      </div>
    </Show>
  );
}
