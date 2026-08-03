/**
 * Renders a `document` transcript part (an attached document). Exports
 * {@link DocumentPartView}.
 */
import { Show } from 'solid-js';
import type { PartDocument } from '@clio/core';
import { PartCard } from './TranscriptPartCard.js';

/**
 * A source document the model may quote/cite (SPEC §4.5 document). The TUI
 * shows title/context plus a source preview; the web renders the same as a
 * card with the title, optional context, and an honest source descriptor
 * (media type + how the bytes are carried) so the transcript records what was
 * grounded against even when the bytes themselves are not inlined.
 */
export function DocumentPartView(props: { part: PartDocument }) {
  const p = props.part;
  const source = () => p.source;
  const sourceLabel = () => {
    const s = source();
    if (!s) return '';
    if (s.kind === 'url' && s.url) return s.url;
    if (s.kind === 'file_id' && s.file_id) return `file ${s.file_id}`;
    if (s.kind === 'base64') return `inline ${s.media_type ?? 'document'}`;
    return s.kind;
  };
  const citationsOn = () => p.citations?.enabled === true;
  return (
    <PartCard
      variant="document"
      testId="trx-document"
      icon="book"
      head={
        <>
          <strong class="trx-document__title">{p.title || 'document'}</strong>
          <Show when={citationsOn()}>
            <span class="trx-document__chip" title="The model may produce citations from this source">
              citable
            </span>
          </Show>
        </>
      }
    >
      <Show when={p.context}>
        <span class="trx-document__context">{p.context}</span>
      </Show>
      <Show when={sourceLabel()}>
        <span class="trx-document__source" data-testid="trx-document-source">
          {sourceLabel()}
        </span>
      </Show>
    </PartCard>
  );
}
