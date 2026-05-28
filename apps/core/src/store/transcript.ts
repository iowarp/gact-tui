import type { Message, Part } from '../wire/types.js';

/**
 * Apply a `text_append` delta to the part with id `partId` inside the
 * message with id `messageId`. Returns a new array — never mutates input.
 * Tolerates unknown ids by returning the messages array unchanged.
 *
 * Per SPEC §7.4 `message.part.delta`, the payload identifies the part by
 * id. The legacy index-based variant lives at `applyTextAppendAtIndex`
 * for fixtures that don't carry stable ids.
 */
export function applyTextAppend(
  messages: Message[],
  messageId: string,
  partId: string,
  textAppend: string,
): Message[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const parts: Part[] = m.parts.map((p) => {
      if (p.id !== partId) return p;
      if (p.type === 'text') {
        return { ...p, text: (p.text ?? '') + textAppend };
      }
      if (p.type === 'thinking') {
        const cur = p.thinking ?? p.text ?? '';
        return { ...p, thinking: cur + textAppend };
      }
      return p;
    });
    return { ...m, parts };
  });
}

/**
 * Index-based variant for fixture data that pre-dates the spec-aligned
 * part `id` field. Falls back to no-op when out of range.
 */
export function applyTextAppendAtIndex(
  messages: Message[],
  messageId: string,
  partIndex: number,
  textAppend: string,
): Message[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const parts: Part[] = m.parts.map((p, i) => {
      if (i !== partIndex) return p;
      if (p.type === 'text') {
        return { ...p, text: (p.text ?? '') + textAppend };
      }
      if (p.type === 'thinking') {
        const cur = p.thinking ?? p.text ?? '';
        return { ...p, thinking: cur + textAppend };
      }
      return p;
    });
    return { ...m, parts };
  });
}

/**
 * Insert a freshly-added part at the end of the named message. No-op if
 * the message is not in the list.
 */
export function appendPart(messages: Message[], messageId: string, part: Part): Message[] {
  return messages.map((m) =>
    m.id === messageId ? { ...m, parts: [...m.parts, part] } : m,
  );
}

/**
 * Insert or replace a message by id (replacement semantics match the
 * TUI's `applyMessageCreated`, which lets streamed shells be replaced
 * by the final message body once it arrives).
 */
export function upsertMessage(messages: Message[], next: Message): Message[] {
  const idx = messages.findIndex((m) => m.id === next.id);
  if (idx === -1) return [...messages, next];
  const copy = messages.slice();
  copy[idx] = next;
  return copy;
}
