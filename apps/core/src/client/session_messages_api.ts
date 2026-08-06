import type { Message } from '../wire/types.js';
import type { SessionTransport } from './session_transport.js';

export interface SessionMessagesResult {
  messages: Message[];
  /**
   * Id of the OLDEST message in this page when `limit` truncated the
   * result (older messages remain beyond this page); `null`/absent when
   * the page was not truncated — the whole ledger (or its tail) is in
   * `messages` and there is nothing left to backfill. Mirrors the
   * backend's `GET /v1/sessions/{sid}/messages` contract (#232).
   */
  next_cursor?: string | null;
}

/**
 * Optional paging for `GET /v1/sessions/{sid}/messages` (#232). Omitting
 * every field reproduces the historical full-ledger fetch. Used by
 * SessionView's progressive transcript load: fetch the newest `limit`
 * messages first (paints immediately), then page backwards with
 * successive `before` cursors to backfill the rest.
 */
export interface FetchSessionMessagesOptions {
  /** Return at most this many NEWEST messages (after `before` is applied). */
  limit?: number;
  /** Cursor: only messages strictly OLDER than this message id. */
  before?: string;
  /** SPEC §4.4: system messages default-included; pass `false` to suppress. */
  includeSystem?: boolean;
}

export interface SendMessageInput {
  text: string;
  metadata?: Record<string, unknown>;
}

export interface SendMessageResult {
  message_id: string;
  accepted_at: string;
}

export type PatchMessagePartInput = Record<string, unknown>;

export type PatchMessagePartResult = Record<string, unknown>;

export function sendMessagePayload(body: SendMessageInput): {
  parts: Array<{ type: 'text'; text: string }>;
  metadata?: Record<string, unknown>;
} {
  const payload: {
    parts: Array<{ type: 'text'; text: string }>;
    metadata?: Record<string, unknown>;
  } = {
    parts: [{ type: 'text', text: body.text }],
  };
  if (body.metadata) payload.metadata = body.metadata;
  return payload;
}

export function fetchSessionMessages(
  client: SessionTransport,
  sessionId: string,
  options?: FetchSessionMessagesOptions,
): Promise<SessionMessagesResult> {
  const qs = new URLSearchParams();
  if (options?.limit !== undefined) qs.set('limit', String(options.limit));
  if (options?.before !== undefined) qs.set('before', options.before);
  if (options?.includeSystem !== undefined) qs.set('include_system', String(options.includeSystem));
  const query = qs.toString();
  return fetchSessionMessagesPage(
    client,
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages${query ? `?${query}` : ''}`,
  );
}

async function fetchSessionMessagesPage(
  client: SessionTransport,
  path: string,
): Promise<SessionMessagesResult> {
  const out = await client.get<SessionMessagesResult>(path);
  // Defensive: always present chronological WITHIN the page. Some clio
  // versions return newest-first which renders the conversation backwards;
  // a paginated page's own internal order is re-sorted the same way, while
  // the page's place relative to OTHER pages is the caller's job (the
  // backend's `before` cursor + `next_cursor`, not `created_at`).
  const sorted = (out.messages ?? []).slice().sort((a, b) => {
    const ta = Date.parse(a.created_at ?? '') || 0;
    const tb = Date.parse(b.created_at ?? '') || 0;
    return ta - tb;
  });
  return { messages: sorted, next_cursor: out.next_cursor ?? null };
}

export function fetchSessionMessage(
  client: SessionTransport,
  sessionId: string,
  messageId: string,
): Promise<Message> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
  );
}

export function removeSessionMessage(
  client: SessionTransport,
  sessionId: string,
  messageId: string,
): Promise<void> {
  return client.request(
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}`,
    'DELETE',
    undefined,
  );
}

export function sendSessionMessage(
  client: SessionTransport,
  sessionId: string,
  body: SendMessageInput,
): Promise<SendMessageResult> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
    sendMessagePayload(body),
  );
}

export function patchSessionMessagePart(
  client: SessionTransport,
  sessionId: string,
  messageId: string,
  partId: string,
  patch: PatchMessagePartInput,
): Promise<PatchMessagePartResult> {
  return client.request(
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages/${encodeURIComponent(messageId)}/parts/${encodeURIComponent(partId)}`,
    'PATCH',
    patch,
  );
}
