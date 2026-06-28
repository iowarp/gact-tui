import {
  fetchSessionMemoryEvents,
  searchMemory,
  type MemorySearchOptions,
  type MemorySearchResult,
  type SessionMemoryEventsResult,
} from './session_search.js';
import { SessionMessagesClient } from './session_messages_client.js';

export class SessionMemoryClient extends SessionMessagesClient {
  /**
   * GET /v1/memory/search?q=… — cross-session full-text search across
   * the whole workspace memory (PR #351). Optional session_id scope.
   */
  memorySearch(q: string, options: MemorySearchOptions = {}): Promise<MemorySearchResult> {
    return searchMemory(this, q, options);
  }

  /**
   * GET /v1/sessions/{id}/memory/events — session-scoped memory event
   * audit log (cache hits, frame writes, tool invocations).
   */
  sessionMemoryEvents(sessionId: string, limit = 50): Promise<SessionMemoryEventsResult> {
    return fetchSessionMemoryEvents(this, sessionId, limit);
  }
}
