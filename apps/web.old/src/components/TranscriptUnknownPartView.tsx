/**
 * Fallback renderer for an unknown/unsupported transcript part type.
 * Exports {@link UnknownPartView}.
 */
import type { PartUnknown } from '@clio/core';
import { Icon } from './Icon.js';

/**
 * Forward-compat fallback (SPEC §2 / §8.3): a Part whose `type` this client
 * does not recognise MUST be tolerated, not dropped. The dispatcher casts any
 * unmatched part to `PartUnknown` and renders this honest placeholder so a
 * newer backend's part still leaves a visible trace in the transcript instead
 * of silently disappearing.
 */
export function UnknownPartView(props: { part: PartUnknown }) {
  return (
    <div class="trx-unknown" data-testid="trx-unknown-part">
      <span class="trx-unknown__icon" aria-hidden>
        <Icon name="help" size={12} />
      </span>
      <span class="trx-unknown__label">
        unsupported part: <code class="trx-unknown__type">{props.part.type || 'unknown'}</code>
      </span>
    </div>
  );
}
