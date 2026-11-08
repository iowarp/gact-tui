import type { Message, Session } from '@clio/core/v3';
import { conversationForkOrigin } from './conversation-fork-origin';

/**
 * Keep a short actual history around the saved fork point, plus the latest continuation.
 *
 * @param partial - messages is the newest page only; a fork point not in it is
 *   older than the page, not rewound.
 */
export function conversationPreview(
  session: Session,
  messages: readonly Message[],
  partial = false,
) {
  const origin = conversationForkOrigin(session);
  const boundary = origin?.message_id
    ? messages.findIndex((message) => message.id === origin.message_id)
    : -1;
  const copiedMessages = boundary < 0 ? [] : messages.slice(0, boundary + 1);
  const continuedMessages = boundary < 0 ? messages : messages.slice(boundary + 1);
  const visible = (items: readonly Message[]) =>
    items.filter((message) => message.role === 'user' || message.role === 'assistant');
  const copied = visible(copiedMessages).slice(-2);
  const continuation = visible(continuedMessages).slice(-2);
  return {
    origin,
    copied,
    continuation,
    boundaryRetained: boundary >= 0 || origin?.message_count === 0 || partial,
  };
}

export function previewText(message: Message): string {
  return message.blocks.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n');
}
