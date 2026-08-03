/**
 * Renders a `citation` transcript part (a referenced source). Exports
 * {@link CitationPartView}.
 */
import { Show } from 'solid-js';
import type { PartCitation } from '@clio/core';
import { PartCard } from './TranscriptPartCard.js';

/**
 * A cited span backed by a source (SPEC §4.5 citation). The TUI shows the
 * cited text + the source reference; the web renders it as a quote block with
 * a source attribution and, when present, the character range of the span.
 */
export function CitationPartView(props: { part: PartCitation }) {
  const p = props.part;
  const range = () => {
    const r = p.text_range;
    if (!r) return '';
    return `chars ${r.start}–${r.end}`;
  };
  return (
    <PartCard variant="citation" testId="trx-citation" icon="book" iconSize={12} root="figure">
      <Show when={p.text}>
        <blockquote class="trx-citation__text">{p.text}</blockquote>
      </Show>
      <figcaption class="trx-citation__source" data-testid="trx-citation-source">
        <Show when={p.source}>
          <span class="trx-citation__chip trx-citation__chip--type">{p.source!.type}</span>
          <span class="trx-citation__ref">{p.source!.reference}</span>
        </Show>
        <Show when={range()}>
          <span class="trx-citation__range">{range()}</span>
        </Show>
      </figcaption>
    </PartCard>
  );
}
