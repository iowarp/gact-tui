import type { AttentionAvailable, Message as DomainMessage } from '@clio/core/v3';
import { bucketIntensity } from './attention-text';

/**
 * A message counts as heated on the rail only when it drew at least this
 * fraction of the attention that reached the conversation's messages; below
 * it, the mark stays grey (the hover still states the share).
 */
export const HEATED_MIN_FRACTION = 0.03;

/** One rail landmark: a message that attention traced back to, and how strongly. */
export interface AttentionMinimapMark {
  messageId: string;
  messageIndex: number;
  /** Sum of `share` across this message's attention blocks (fraction of ALL attention). */
  totalShare: number;
  /**
   * This message's part of the attention that reached the conversation's
   * messages (0..1; all marks sum to 1). This is what the rail shows: the
   * rest of the attention went to the system prompt, the tool definitions,
   * the chat formatting, or was spread thin.
   */
  conversationShare: number;
  /** Whether it clears `HEATED_MIN_FRACTION` and is drawn as heat. */
  heated: boolean;
  /** Intensity bucket (0..levels-1) of `totalShare` relative to the heaviest message. */
  bucket: number;
  blockCount: number;
}

/**
 * One mark per message the payload traced attention back to, ordered by
 * transcript position. A message can hold several attention blocks (its
 * text, a tool's thought, its result, ...); those are summed into one mark,
 * since the rail places a reader at a message, not at a part inside it.
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
  const entries = [...byMessage.values()];
  const maxShare = Math.max(0, ...entries.map((entry) => entry.totalShare));
  const conversationTotal = entries.reduce((sum, entry) => sum + entry.totalShare, 0);
  return [...byMessage.entries()]
    .map(([messageId, entry]) => {
      const conversationShare = conversationTotal > 0 ? entry.totalShare / conversationTotal : 0;
      return {
        messageId,
        messageIndex: messageIndexById.get(messageId) as number,
        totalShare: entry.totalShare,
        conversationShare,
        heated: conversationShare >= HEATED_MIN_FRACTION,
        bucket: bucketIntensity(entry.totalShare, maxShare, levels),
        blockCount: entry.blockCount,
      };
    })
    .sort((left, right) => left.messageIndex - right.messageIndex);
}
