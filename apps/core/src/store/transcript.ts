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
 * Apply a `message.part.completed` payload: replace the named part's
 * text with the server-side `final_text`. Required for batch providers
 * (argonne, claude_code, codex) where the entire text arrives on the
 * `part.completed` event because no `part.delta` chunks are emitted.
 * Tolerates unknown ids (no-op) and non-text parts (no-op).
 */
export function applyPartCompleted(
  messages: Message[],
  messageId: string,
  partId: string,
  finalText: string,
): Message[] {
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const parts: Part[] = m.parts.map((p) => {
      if (p.id !== partId) return p;
      if (p.type === 'text') {
        return { ...p, text: finalText };
      }
      if (p.type === 'thinking') {
        return { ...p, thinking: finalText, text: finalText };
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
  return messages.map((m) => {
    if (m.id !== messageId) return m;
    const idx = m.parts.findIndex((existing) => existing.id === part.id);
    if (idx === -1) return { ...m, parts: [...m.parts, part] };
    const parts = m.parts.slice();
    parts[idx] = part;
    return { ...m, parts };
  });
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

/** Total text length carried by a part — the heuristic for "more complete". */
function partTextLength(part: Part): number {
  if (part.type === 'text') return (part.text ?? '').length;
  if (part.type === 'thinking') return (part.thinking ?? part.text ?? '').length;
  return 0;
}

/**
 * Merge a freshly-reconciled message (server-authoritative) with the local
 * in-flight copy of the *same* message, preserving streaming mutations that
 * may have landed after the reconcile fetch was issued.
 *
 * The reconciled message wins for everything (role, tokens, cost, stop_reason,
 * error_info, …) *except* per-part streamed text: for any part present in both,
 * whichever side carries more text is kept (a `message.part.delta` text-append
 * that raced the fetch must not be clobbered by a stale snapshot). Local-only
 * parts that the snapshot has not caught up to yet are appended.
 */
function mergeMessage(local: Message, reconciled: Message): Message {
  const localById = new Map(local.parts.map((p) => [p.id, p]));
  const merged: Part[] = reconciled.parts.map((rp) => {
    const lp = rp.id != null ? localById.get(rp.id) : undefined;
    if (!lp) return rp;
    // Keep whichever side has more streamed text; otherwise the reconciled
    // part is authoritative (it may carry finalised non-text fields).
    return partTextLength(lp) > partTextLength(rp) ? lp : rp;
  });
  const reconciledIds = new Set(
    reconciled.parts.map((p) => p.id).filter((id): id is string => id != null),
  );
  for (const lp of local.parts) {
    if (lp.id == null || !reconciledIds.has(lp.id)) merged.push(lp);
  }
  return { ...reconciled, parts: merged };
}

/**
 * Key-based MERGE of a reconciled message list into the current local feed.
 *
 * Used by the debounced transcript reconciler (`/v1/messages` refetch on
 * `message.completed`/`error`/`deleted`). A wholesale `setMessages(reconciled)`
 * replace would discard SSE mutations (e.g. `message.part.delta` text-append,
 * a brand-new `message.created`) that arrived *during* the in-flight fetch.
 *
 * Semantics:
 *  - the reconciled list is authoritative for every message it returns and
 *    establishes ordering;
 *  - messages present in both are merged via {@link mergeMessage} so in-flight
 *    per-part streaming text is preserved;
 *  - local-only messages (ids the snapshot has not caught up to yet) are kept,
 *    appended after the reconciled list in their original relative order.
 *
 * Never mutates either input.
 */
export function mergeMessages(local: Message[], reconciled: Message[]): Message[] {
  const localById = new Map(local.map((m) => [m.id, m]));
  const merged = reconciled.map((rm) => {
    const lm = localById.get(rm.id);
    return lm ? mergeMessage(lm, rm) : rm;
  });
  const reconciledIds = new Set(reconciled.map((m) => m.id));
  for (const lm of local) {
    if (!reconciledIds.has(lm.id)) merged.push(lm);
  }
  return merged;
}
