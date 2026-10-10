import type { Message } from '@clio/core/v3';

/** Place only server-receipted feedback inside the response that consumed it. */
export function placeDeliveredFeedback(messages: readonly Message[]): {
  messages: readonly Message[];
  feedback: ReadonlyMap<string, readonly Message[]>;
} {
  const owners = new Map(messages.map((message) => [message.id, message]));
  const feedback = new Map<string, Message[]>();
  const placed = new Set<string>();
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const delivery = message.metadata?.steer_delivery as
      | { assistant_message_id?: unknown; after_part_id?: unknown }
      | undefined;
    if (!delivery || typeof delivery.assistant_message_id !== 'string') continue;
    const owner = owners.get(delivery.assistant_message_id);
    if (
      owner?.role !== 'assistant' ||
      typeof delivery.after_part_id !== 'string' ||
      (delivery.after_part_id !== '' &&
        !owner.blocks.some((block) => block.id === delivery.after_part_id))
    )
      continue;
    const rows = feedback.get(owner.id) ?? [];
    rows.push(message);
    feedback.set(owner.id, rows);
    placed.add(message.id);
  }
  return { messages: messages.filter((message) => !placed.has(message.id)), feedback };
}
