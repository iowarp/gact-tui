import type { Message, PendingCompaction } from '@clio/core/v3';

export interface CompactionPlacement {
  /** Compactions shown after the content of the message they started after. */
  byMessage: ReadonlyMap<string, readonly PendingCompaction[]>;
  /** Compactions with no visible anchor, shown after the last message. */
  trailing: readonly PendingCompaction[];
}

/**
 * Places each live compaction where it started (its anchor message). A
 * compaction that reported success stays until its summary block is in the
 * transcript; once any visible message carries that block, the transcript
 * renders it and the progress row is dropped, whichever path delivered it.
 */
export function placeCompactions(
  compactions: readonly PendingCompaction[],
  messages: readonly Message[],
): CompactionPlacement {
  const byMessage = new Map<string, PendingCompaction[]>();
  const trailing: PendingCompaction[] = [];
  if (compactions.length === 0) return { byMessage, trailing };
  const visible = new Set(messages.map((message) => message.id));
  const summarized = new Set<string>();
  const residentParts = new Set<string>();
  for (const message of messages) {
    for (const block of message.blocks) {
      residentParts.add(`${message.id}\u0000${block.id}`);
      if (block.type === 'injection' && block.source === 'summarization' && block.compaction_id) {
        summarized.add(block.compaction_id);
      }
    }
  }
  const ordered = [...compactions].sort((left, right) =>
    left.started_at.localeCompare(right.started_at),
  );
  for (const compaction of ordered) {
    const shown =
      compaction.status === 'failed' ||
      (!summarized.has(compaction.compaction_id) &&
        !(
          compaction.message_id &&
          compaction.part_id &&
          residentParts.has(`${compaction.message_id}\u0000${compaction.part_id}`)
        ));
    if (!shown) continue;
    const anchor = compaction.anchor_message_id;
    if (anchor && visible.has(anchor)) {
      byMessage.set(anchor, [...(byMessage.get(anchor) ?? []), compaction]);
    } else {
      trailing.push(compaction);
    }
  }
  return { byMessage, trailing };
}
