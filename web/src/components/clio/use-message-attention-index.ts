import type { AttentionAvailable, Message } from '@clio/core/v3';
import { useMemo } from 'react';
import { buildMessageAttentionIndex, type MessageAttentionIndex } from '@/lib/attention-tool-index';

/**
 * Memoized per-message attention index for one transcript row.
 *
 * Lives in its own module, taking plain parameters rather than fields of the
 * row's rest-spread entities object, for the same reason `useConversationTurn`
 * does: a value derived from a member expression on a prop the row also
 * spreads onward cannot be verified stable, so it is pulled out here first.
 */
export function useMessageAttentionIndex(
  attentionData: AttentionAvailable | undefined,
  message: Message,
): MessageAttentionIndex | undefined {
  return useMemo(
    () => (attentionData ? buildMessageAttentionIndex(attentionData, message) : undefined),
    [attentionData, message],
  );
}
