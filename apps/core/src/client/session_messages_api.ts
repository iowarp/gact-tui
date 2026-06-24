import type { Message } from '../wire/types.js';
import type { SessionTransport } from './session_transport.js';

export interface SessionMessagesResult {
  messages: Message[];
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

export async function fetchSessionMessages(
  client: SessionTransport,
  sessionId: string,
): Promise<SessionMessagesResult> {
  const out = await client.get<SessionMessagesResult>(
    `/v1/sessions/${encodeURIComponent(sessionId)}/messages`,
  );
  // Defensive: always present chronological. Some clio versions
  // return newest-first which renders the conversation backwards.
  const sorted = (out.messages ?? []).slice().sort((a, b) => {
    const ta = Date.parse(a.created_at ?? '') || 0;
    const tb = Date.parse(b.created_at ?? '') || 0;
    return ta - tb;
  });
  return { messages: sorted };
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
