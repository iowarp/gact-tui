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
  type Client,
  type Message,
  type Part,
  type SessionMessageEvent,
} from '@clio/core';

/**
 * The outcome of applying one message-lifecycle event to a loaded feed
 * (gact-tui#364 client-half deliverable — "applied vs unapplied-unknown-id
 * typed result… unapplied triggers the existing debounced reconcile"):
 *
 * - `applied` — the event named a message/part this feed already has (or
 *   introduces a new message); `messages` carries the result.
 * - `unapplied_unknown_id` — the event named a `message_id`/`part_id` this
 *   feed does NOT have. This is a divergence signal, not a confirmed bug —
 *   ordinary causes include a page boundary still in flight — but it is
 *   exactly the shape a dropped or out-of-order SSE frame (clio-agent
 *   events.py's EventBus silently drops on `QueueFull`, gact-tui#364 H-A)
 *   would also produce. A caller with a reconcile path should treat it as a
 *   reason to reconcile, never a reason to guess.
 * - `irrelevant` — a reconcile-class event type (message.completed/error/
 *   deleted — callers with a reconcile path handle those directly by type,
 *   not through this function) or a malformed/unrecognized payload; neither
 *   is a feed divergence.
 */
export type MessageLifecycleApplyResult =
  | { kind: 'applied'; messages: Message[] }
  | { kind: 'unapplied_unknown_id' }
  | { kind: 'irrelevant' };

/**
 * Apply one message-lifecycle event to a loaded messages array.
 *
 * Returns a typed result distinguishing a real application from an
 * unknown-id no-op from an irrelevant event — see
 * {@link MessageLifecycleApplyResult}. Never guesses: an id this feed
 * doesn't recognize is reported, not silently collapsed into the same
 * unchanged-array shape a real application would produce.
 */
export function applyMessageLifecycleEvent(
  messages: Message[],
  event: SessionMessageEvent,
): MessageLifecycleApplyResult {
  const payload = event.payload;
  switch (event.type) {
    case 'message.created': {
      // The payload IS the message wire object (transcript.py publishes
      // Message.to_wire() directly); a nested {message} envelope is the
      // older shape, honored when present.
      const flat = payload['id'] && payload['role'] ? (payload as unknown as Message) : undefined;
      const nested = payload['message'] as Message | undefined;
      const message = nested ?? flat;
      if (!message) return { kind: 'irrelevant' };
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
      if (incomingEmpty && localRicher) return { kind: 'applied', messages };
      return { kind: 'applied', messages: upsertMessage(messages, incoming) };
    }
    case 'message.part.added':
    case 'message.part.updated': {
      // The clean delegation wire's IN-PLACE settle rides part.updated (the
      // terminal expert_handoff replaces the started part by id; appendPart's
      // upsert-by-id is exactly that).
      const messageId = payload['message_id'] as string | undefined;
      const part = payload['part'] as Part | undefined;
      if (!messageId || !part) return { kind: 'irrelevant' };
      if (!messages.some((m) => m.id === messageId)) return { kind: 'unapplied_unknown_id' };
      return { kind: 'applied', messages: appendPart(messages, messageId, part) };
    }
    case 'message.part.delta': {
      const messageId = payload['message_id'] as string | undefined;
      const partId = payload['part_id'] as string | undefined;
      const delta = (payload['delta'] as { text_append?: string } | undefined) ?? {};
      if (!messageId || !partId || !delta.text_append) return { kind: 'irrelevant' };
      const message = messages.find((m) => m.id === messageId);
      if (!message?.parts.some((p) => p.id === partId)) return { kind: 'unapplied_unknown_id' };
      return { kind: 'applied', messages: applyTextAppend(messages, messageId, partId, delta.text_append) };
    }
    case 'message.part.completed': {
      const messageId = payload['message_id'] as string | undefined;
      const partId = payload['part_id'] as string | undefined;
      const finalText = payload['final_text'];
      if (!messageId || !partId || typeof finalText !== 'string') return { kind: 'irrelevant' };
      const message = messages.find((m) => m.id === messageId);
      if (!message?.parts.some((p) => p.id === partId)) return { kind: 'unapplied_unknown_id' };
      return { kind: 'applied', messages: applyPartCompleted(messages, messageId, partId, finalText) };
    }
    default:
      return { kind: 'irrelevant' };
  }
}

/**
 * Newest-first page size for a child/peek session's own message ledger —
 * the same idiom the main transcript's progressive load uses (#232 paging,
 * SessionView's `TRANSCRIPT_PAGE_SIZE`), reused here so ChildFocusView
 * (center drill-in) and AgentPeekView (right-panel peek) both paint their
 * newest page immediately instead of blocking on the whole ledger (round-6
 * paging ruling, 2026-08-06).
 */
export const CHILD_PAGE_SIZE = 50;

/**
 * Backfills OLDER pages of a child/peek session's ledger, one `before`
 * cursor at a time, until the backend reports no more — the background half
 * of the progressive-load idiom (the caller fetches/paints the newest page
 * itself; this walks the rest). `isStale` is checked before EVERY network
 * round trip and bails out silently the moment it turns true — a session
 * switch or an unmount must never let a stale backfill land on the wrong
 * view. A failed page leaves whatever was already loaded exactly as correct
 * as it already was, never a retry loop or a fabricated gap.
 */
export async function backfillChildMessages(
  client: Pick<Client, 'messages'>,
  sessionId: string,
  startCursor: string,
  options: {
    onOlderPage: (messages: Message[]) => void;
    isStale: () => boolean;
    pageSize?: number;
  },
): Promise<void> {
  const pageSize = options.pageSize ?? CHILD_PAGE_SIZE;
  let cursor: string | null = startCursor;
  while (cursor) {
    if (options.isStale()) return;
    let page;
    try {
      page = await client.messages(sessionId, { limit: pageSize, before: cursor });
    } catch {
      return;
    }
    if (options.isStale()) return;
    options.onOlderPage(page.messages ?? []);
    cursor = page.next_cursor ?? null;
  }
}
