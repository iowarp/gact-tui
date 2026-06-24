/**
 * Renders a `redacted_thinking` transcript part (redacted reasoning).
 * Exports {@link TranscriptRedactedThinkingPartView}.
 */
import type { PartRedactedThinking } from '@clio/core';
import { Icon } from './Icon.js';

/**
 * A redacted-thinking part (SPEC §4.5, type `redacted_thinking`): the backend
 * reasoned but the content is encrypted/redacted, exposing only an opaque
 * `data` blob (+ optional `signature`). We deliberately do NOT render that blob
 * — it is not human-readable — and instead show a compact note mirroring the
 * normal thinking part so the reasoning boundary is still visible. Matches the
 * TUI's muted thinking-style marker.
 */
export function TranscriptRedactedThinkingPartView(_props: { part: PartRedactedThinking }) {
  return (
    <div class="trx-redacted" data-testid="trx-redacted-thinking">
      <span class="trx-redacted__icon" aria-hidden>
        <Icon name="thinking" size={12} />
      </span>
      <span class="trx-redacted__label">Redacted reasoning</span>
      <span class="trx-redacted__hint">contents hidden by the provider</span>
    </div>
  );
}
