/**
 * Applying the session SSE message-lifecycle wire to a loaded feed — ONE
 * owner for the event→feed application that the main transcript, the center
 * child-focus view, and the right-panel agent peek all share (it existed as
 * two hand-copied switches in SessionView before the peek view would have
 * made it a third).
 *
 * Pure application of the server's wire — no dedup, no reshaping (owner rule
 * 2026-08-05).
 */
import {
  appendPart,
  applyPartCompleted,
  applyTextAppend,
  upsertMessage,
  type Message,
  type Part,
  type SessionMessageEvent,
} from '@clio/core';

/**
 * Apply one message-lifecycle event to a loaded messages array.
 *
 * Returns the next array, or `null` when the event carries no direct feed
 * application — message.completed/error/deleted are reconcile-class events
 * (callers with a reconcile path handle them), and a malformed payload is
 * a no-op rather than a guess.
 */
export function applyMessageLifecycleEvent(
  messages: Message[],
  event: SessionMessageEvent,
): Message[] | null {
  const payload = event.payload;
  switch (event.type) {
    case 'message.created': {
      // The payload IS the message wire object (transcript.py publishes
      // Message.to_wire() directly); a nested {message} envelope is the
      // older shape, honored when present.
      const flat = payload['id'] && payload['role'] ? (payload as unknown as Message) : undefined;
      const nested = payload['message'] as Message | undefined;
      const message = nested ?? flat;
      if (!message) return null;
      const incoming = { ...message, parts: message.parts ?? [] };
      // SSE replay re-delivers message.created with the CREATION-TIME shell
      // (parts [], metadata {}) for messages the client already fetched in
      // full — a wholesale upsert wiped the delegation_return stamp and every
      // part for ~5s until reconcile (owner capture, round 5). A historical
      // empty shell never clobbers richer local state; anything non-empty
      // keeps the wire's replacement semantics.
      const existing = messages.find((m) => m.id === incoming.id);
      const incomingEmpty =
        incoming.parts.length === 0 &&
        (!incoming.metadata || Object.keys(incoming.metadata).length === 0);
      const localRicher =
        existing !== undefined &&
        (existing.parts.length > 0 ||
          (existing.metadata !== undefined && Object.keys(existing.metadata).length > 0));
      if (incomingEmpty && localRicher) return messages;
      return upsertMessage(messages, incoming);
    }
    case 'message.part.added':
    case 'message.part.updated': {
      // The clean delegation wire's IN-PLACE settle rides part.updated (the
      // terminal expert_handoff replaces the started part by id; appendPart's
      // upsert-by-id is exactly that).
      const messageId = payload['message_id'] as string | undefined;
      const part = payload['part'] as Part | undefined;
      if (!messageId || !part) return null;
      return appendPart(messages, messageId, part);
    }
    case 'message.part.delta': {
      const messageId = payload['message_id'] as string | undefined;
      const partId = payload['part_id'] as string | undefined;
      const delta = (payload['delta'] as { text_append?: string } | undefined) ?? {};
      if (!messageId || !partId || !delta.text_append) return null;
      return applyTextAppend(messages, messageId, partId, delta.text_append);
    }
    case 'message.part.completed': {
      const messageId = payload['message_id'] as string | undefined;
      const partId = payload['part_id'] as string | undefined;
      const finalText = payload['final_text'];
      if (!messageId || !partId || typeof finalText !== 'string') return null;
      return applyPartCompleted(messages, messageId, partId, finalText);
    }
    default:
      return null;
  }
}
