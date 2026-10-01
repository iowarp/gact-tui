import type { Message, PendingCompaction } from '@clio/core/v3';

export interface CompactionPlacement {
  /** Compactions shown after the content of the message they started after. */
  byMessage: ReadonlyMap<string, readonly PendingCompaction[]>;
  /** Compactions with no visible anchor, shown after the last message. */
  trailing: readonly PendingCompaction[];
}

/**
 * Places each live compaction where it started (its anchor message). Its
 * outcome's durable record is a transcript block -- the summary, or the
 * failure notice -- so once any visible message carries that block the
 * transcript renders it and the live row is dropped, whichever path delivered
 * it. Only a failure the service could not record stays a live row.
 */
export function placeCompactions(
  compactions: readonly PendingCompaction[],
  messages: readonly Message[],
): CompactionPlacement {
  const byMessage = new Map<string, PendingCompaction[]>();
  const trailing: PendingCompaction[] = [];
  if (compactions.length === 0) return { byMessage, trailing };
  const visible = new Set(messages.map((message) => message.id));
  const recorded = new Set<string>();
  const residentParts = new Set<string>();
  const residentBlockIds = new Set<string>();
  for (const message of messages) {
    for (const block of message.blocks) {
      residentParts.add(`${message.id}\u0000${block.id}`);
      residentBlockIds.add(block.id);
      const outcome =
        (block.type === 'injection' && block.source === 'summarization') ||
        (block.type === 'notice' && block.source === 'compaction_failed');
      if (outcome && block.compaction_id) recorded.add(block.compaction_id);
    }
  }
  const ordered = [...compactions].sort((left, right) =>
    left.started_at.localeCompare(right.started_at),
  );
  for (const compaction of ordered) {
    const partResident = compaction.part_id
      ? compaction.message_id
        ? residentParts.has(`${compaction.message_id}\u0000${compaction.part_id}`)
        : residentBlockIds.has(compaction.part_id)
      : false;
    const shown = !recorded.has(compaction.compaction_id) && !partResident;
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
