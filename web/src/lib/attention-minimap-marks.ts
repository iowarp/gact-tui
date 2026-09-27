import type { AttentionAvailable, Message as DomainMessage } from '@clio/core/v3';
import { bucketIntensity } from './attention-text';

/** One minimap landmark: a message that attention traced back to, and how strongly. */
export interface AttentionMinimapMark {
  messageId: string;
  messageIndex: number;
  /** Sum of `share` across this message's attention blocks. */
  totalShare: number;
  /** Intensity bucket (0..levels-1) of `totalShare` relative to the heaviest message. */
  bucket: number;
  blockCount: number;
}

/**
 * One mark per message the payload traced attention back to, ordered by
 * transcript position. A message can hold several attention blocks (its
 * text, a tool's thought, its result, ...); those are summed into one mark
 * rather than drawn separately, since the minimap can only place a reader at
 * a message, not at a specific part inside it.
 */
export function attentionMinimapMarks(
  data: AttentionAvailable | undefined,
  messages: readonly DomainMessage[],
  levels = 4,
): AttentionMinimapMark[] {
  if (!data) return [];
  const messageIndexById = new Map(messages.map((message, index) => [message.id, index]));
  const byMessage = new Map<string, { totalShare: number; blockCount: number }>();
  for (const block of data.blocks) {
    if (!messageIndexById.has(block.message_id)) continue;
    const entry = byMessage.get(block.message_id) ?? { totalShare: 0, blockCount: 0 };
    entry.totalShare += block.share;
    entry.blockCount += 1;
    byMessage.set(block.message_id, entry);
  }
  const maxShare = Math.max(0, ...[...byMessage.values()].map((entry) => entry.totalShare));
  return [...byMessage.entries()]
    .map(([messageId, entry]) => ({
      messageId,
      messageIndex: messageIndexById.get(messageId) as number,
      totalShare: entry.totalShare,
      bucket: bucketIntensity(entry.totalShare, maxShare, levels),
      blockCount: entry.blockCount,
    }))
    .sort((left, right) => left.messageIndex - right.messageIndex);
}
