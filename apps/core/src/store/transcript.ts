import type { Message, Part } from '../wire/types.js';

/**
 * Apply a `text_append` delta to part #partIndex of the message with id
 * `messageId`. Returns a new array — never mutates input. Tolerates unknown
 * message ids by returning the messages array unchanged.
 */
export function applyTextAppend(
  messages: Message[],
  messageId: string,
  partIndex: number,
  textAppend: string,
): Message[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const parts: Part[] = m.parts.map((p, i) => {
      if (i !== partIndex) return p;
      if (p.type !== 'text' && p.type !== 'thinking') return p;
      return { ...p, text: (p.text ?? '') + textAppend };
    });
    return { ...m, parts };
  });
}

/**
 * Insert a freshly-added part at the end of the named message. No-op if the
 * message is not in the list.
 */
export function appendPart(messages: Message[], messageId: string, part: Part): Message[] {
  return messages.map((m) =>
    m.id === messageId ? { ...m, parts: [...m.parts, part] } : m,
  );
}

/**
 * Insert or replace a message by id (replacement semantics match the TUI's
 * `applyMessageCreated`, which lets streamed shells be replaced by the final
 * message body once it arrives).
 */
export function upsertMessage(messages: Message[], next: Message): Message[] {
  const idx = messages.findIndex((m) => m.id === next.id);
  if (idx === -1) return [...messages, next];
  const copy = messages.slice();
  copy[idx] = next;
  return copy;
}
