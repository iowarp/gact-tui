import type { HttpTransport } from './transport.js';

type SessionSearchTransport = Pick<HttpTransport, 'get'>;

export interface SearchSessionMessagesResult {
  matches: Array<{
    message_id: string;
    part_id?: string;
    snippet: string;
    score?: number;
  }>;
}

export interface MemorySearchOptions {
  session_id?: string;
  workspace_id?: string;
  limit?: number;
}

export interface MemorySearchResult {
  query: string;
  hits: Array<{
    session_id: string;
    message_id: string;
    role?: string;
    text: string;
    score?: number;
    match_terms?: string[];
  }>;
}

export interface SessionMemoryEventsResult {
  events: Array<Record<string, unknown>>;
}

export function searchMessages(
  client: SessionSearchTransport,
  sessionId: string,
  q: string,
): Promise<SearchSessionMessagesResult> {
  const qs = new URLSearchParams({ q }).toString();
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/messages/search?${qs}`);
}

export function searchMemory(
  client: SessionSearchTransport,
  q: string,
  options: MemorySearchOptions = {},
): Promise<MemorySearchResult> {
  const qs = new URLSearchParams({ q });
  if (options.session_id) qs.set('session_id', options.session_id);
  if (options.workspace_id) qs.set('workspace_id', options.workspace_id);
  if (options.limit) qs.set('limit', String(options.limit));
  return client.get(`/v1/memory/search?${qs}`);
}

export function fetchSessionMemoryEvents(
  client: SessionSearchTransport,
  sessionId: string,
  limit = 50,
): Promise<SessionMemoryEventsResult> {
  const qs = limit ? `?limit=${limit}` : '';
  return client.get(`/v1/sessions/${encodeURIComponent(sessionId)}/memory/events${qs}`);
}
