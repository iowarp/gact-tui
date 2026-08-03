/**
 * Renders a `compaction` transcript part (a context-compaction marker).
 * Exports {@link TranscriptCompactionPartView}.
 */
import { Show } from 'solid-js';
import type { PartCompaction } from '@clio/core';
import { PartCard } from './TranscriptPartCard.js';

/**
 * A context-compaction part (SPEC §4.5, type `compaction`): clio summarised a
 * span of earlier messages to reclaim context budget. The TUI renders this as
 * a muted `⌘ compacted context summary` block (render_part_misc.go
 * renderCompactionPart). The web shows the same summary plus how many messages
 * were folded in and whether the compaction was automatic or manual.
 */
export function TranscriptCompactionPartView(props: { part: PartCompaction }) {
  const p = props.part;
  const count = () => p.compacted_message_ids?.length ?? 0;
  const countLabel = () => {
    const n = count();
    return `${n} message${n === 1 ? '' : 's'} compacted`;
  };
  return (
    <PartCard
      variant="compaction"
      testId="trx-compaction-part"
      icon="memory"
      iconSize={14}
      head={
        <>
          <span class="trx-compaction__eyebrow">compacted context summary</span>
          <span class="trx-compaction__chip" data-testid="trx-compaction-count">
            {countLabel()}
          </span>
          <span class="trx-compaction__chip" data-testid="trx-compaction-mode">
            {p.auto ? 'auto' : 'manual'}
          </span>
        </>
      }
    >
      <Show when={p.summary?.trim()}>
        <p class="trx-compaction__summary" data-testid="trx-compaction-summary">
          {p.summary}
        </p>
      </Show>
    </PartCard>
  );
}
