/**
 * Renders an `error` transcript part with its error taxonomy. Exports
 * {@link TranscriptErrorPartView}.
 */
import { Show } from 'solid-js';
import type { PartError } from '@clio/core';
import { PartCard } from './TranscriptPartCard.js';

/**
 * A turn-level error part (SPEC §4.5, type `error`): the backend reports that
 * something went wrong mid-turn (code + message, optionally recoverable). The
 * TUI renders this as a danger-coloured `✗ <code>` header with the wrapped
 * message (render_part_misc.go renderErrorPart). This is distinct from a tool
 * *result* error — it is a standalone part on the assistant message, so it gets
 * its own danger card rather than being folded into a tool row.
 */
export function TranscriptErrorPartView(props: { part: PartError }) {
  const p = props.part;
  return (
    <PartCard
      variant="error"
      testId="trx-error-part"
      icon="alert"
      iconSize={14}
      role="alert"
      head={
        <>
          <span class="trx-error__eyebrow">error</span>
          <Show when={p.code}>
            <code class="trx-error__code" data-testid="trx-error-code">
              {p.code}
            </code>
          </Show>
        </>
      }
    >
      <Show when={p.message}>
        <p class="trx-error__message" data-testid="trx-error-message">
          {p.message}
        </p>
      </Show>
      <span
        class="trx-error__hint"
        classList={{ 'trx-error__hint--recoverable': p.recoverable === true }}
        data-testid="trx-error-recoverable"
      >
        {p.recoverable ? 'recoverable — clio can retry' : 'unrecoverable'}
      </span>
    </PartCard>
  );
}
