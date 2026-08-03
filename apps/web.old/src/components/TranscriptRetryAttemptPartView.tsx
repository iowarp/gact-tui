/**
 * Renders a `retry_attempt` transcript part (a retried turn attempt).
 * Exports {@link RetryAttemptPartView}.
 */
import { Show } from 'solid-js';
import type { PartRetryAttempt } from '@clio/core';
import { Icon } from './Icon.js';

/**
 * A retry marker emitted when clio re-attempts a failed turn (SPEC §4.5
 * retry_attempt). The TUI shows an "attempt N/max" marker plus the reason; the
 * web renders the same as a slim divider-style row so the retry boundary is
 * visible in the transcript without looking like a normal message.
 */
export function RetryAttemptPartView(props: { part: PartRetryAttempt }) {
  const p = props.part;
  const ra = () => p.retry_attempt;
  const counter = () => {
    const r = ra();
    if (!r || r.attempt === undefined) return 'retry';
    if (r.max_attempts) return `attempt ${r.attempt}/${r.max_attempts}`;
    return `attempt ${r.attempt}`;
  };
  return (
    <div class="trx-retry" data-testid="trx-retry-attempt" role="separator">
      <span class="trx-retry__icon" aria-hidden>
        <Icon name="refresh" size={12} />
      </span>
      <span class="trx-retry__counter" data-testid="trx-retry-counter">
        {counter()}
      </span>
      <Show when={ra()?.reason}>
        <span class="trx-retry__reason">{ra()!.reason}</span>
      </Show>
    </div>
  );
}
