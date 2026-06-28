import type { Message, TurnAttempt } from '../wire/types.js';
import {
  compactSessionMessages,
  fetchSessionAttempts,
  fetchSessionMessage,
  fetchSessionMessages,
  patchSessionMessagePart,
  removeSessionMessage,
  retrySessionTurn,
  rewindSessionMessages,
  sendSessionMessage,
  summarizeSessionMessages,
  undoSessionMessages,
  type CompactSessionInput,
  type PatchMessagePartInput,
  type PatchMessagePartResult,
  type RewindSessionInput,
  type RetryTurnInput,
  type RollbackSessionInput,
  type RollbackSessionResult,
  type SendMessageInput,
  type SendMessageResult,
  type SessionAttemptsResult,
  type SessionMessagesResult,
  type SummarizeSessionInput,
} from './session.js';
import { searchMessages, type SearchSessionMessagesResult } from './session_search.js';
import { SessionRecordsClient } from './session_records_client.js';

export class SessionMessagesClient extends SessionRecordsClient {
  async messages(sessionId: string): Promise<SessionMessagesResult> {
    return fetchSessionMessages(this, sessionId);
  }

  /**
   * DELETE /v1/sessions/{sid}/messages/{id} — drop a single message.
   * Per-message surgical undo, distinct from `undoSession`'s tail trim.
   */
  deleteMessage(sessionId: string, messageId: string): Promise<void> {
    return removeSessionMessage(this, sessionId, messageId);
  }

  /**
   * GET /v1/sessions/{sid}/messages/search?q=… — backend-side full
   * text search. Returns relevance-scored hits. Use over client-side
   * substring once the transcript has more than a few hundred turns.
   */
  searchSessionMessages(sessionId: string, q: string): Promise<SearchSessionMessagesResult> {
    return searchMessages(this, sessionId, q);
  }

  /**
   * POST /v1/sessions/{id}/undo — drops the last N messages from the
   * session (default 1). Per clio-agent develop turn-rollback work.
   * Returns the rollback envelope {kept_messages, deleted_messages}.
   */
  undoSession(sessionId: string, body: RollbackSessionInput = {}): Promise<RollbackSessionResult> {
    return undoSessionMessages(this, sessionId, body);
  }

  /**
   * POST /v1/sessions/{id}/rewind — drops every message after the
   * given target_message_id (and the target itself if include_target).
   * Useful for "back up two turns and try again" workflows.
   */
  rewindSession(sessionId: string, body: RewindSessionInput): Promise<RollbackSessionResult> {
    return rewindSessionMessages(this, sessionId, body);
  }

  /**
   * POST /v1/sessions/{id}/compact — collapses earlier conversation
   * into a compacted summary to free up context window. Per
   * clio-agent develop. 204 on success — `session.compacted` event
   * fires asynchronously when done.
   */
  compactSession(sessionId: string, body: CompactSessionInput = {}): Promise<void> {
    return compactSessionMessages(this, sessionId, body);
  }

  /**
   * POST /v1/sessions/{id}/summarize — kicks off async summarization; the
   * result is expected to land on the SSE stream as `session.summarized`.
   *
   * NOT YET IMPLEMENTED IN clio-agent: there is no such route (returns 404)
   * and clio never emits `session.summarized` (verified against source —
   * the only `summarize` in app.py is internal to `compact`). This is a
   * distinct planned feature from `compact` (a user-facing TLDR/abstract,
   * not context-window management); tracked as an iowarp/clio-agent issue.
   * The desktop gates its summarize actions on `capabilities.session_summary`
   * so this method is only invoked once a backend advertises support.
   */
  summarizeSession(sessionId: string, body: SummarizeSessionInput = {}): Promise<void> {
    return summarizeSessionMessages(this, sessionId, body);
  }

  /**
   * POST /v1/sessions/{id}/messages — append a user message. The server
   * responds with an accepted envelope; streaming continuations arrive on
   * the per-session SSE feed.
   */
  sendMessage(sessionId: string, body: SendMessageInput): Promise<SendMessageResult> {
    return sendSessionMessage(this, sessionId, body);
  }

  /** GET /v1/sessions/{id}/messages/{msg_id} — single-message fetch.
   * Used by permalink loading: paste a clio://session/{sid}#{mid}
   * URL and the client can verify the message exists before scrolling
   * the transcript. */
  getMessage(sessionId: string, messageId: string): Promise<Message> {
    return fetchSessionMessage(this, sessionId, messageId);
  }

  /** PATCH /v1/sessions/{id}/messages/{msg_id}/parts/{part_id} —
   * partial patch of a single Part. Used for in-place edits to a
   * tool_result, text fragment, etc. */
  patchMessagePart(
    sessionId: string,
    messageId: string,
    partId: string,
    patch: PatchMessagePartInput,
  ): Promise<PatchMessagePartResult> {
    return patchSessionMessagePart(this, sessionId, messageId, partId, patch);
  }

  /** POST /v1/sessions/{sid}/messages/{id}/retry — re-run a turn while
   * PRESERVING attempt lineage (clio records a TurnAttempt + emits
   * `turn.retry_*` events, returns 202). Pass the assistant message being
   * regenerated; clio derives the source user message. `execute:true`
   * actually re-runs it (vs just recording the attempt). This is the
   * correct path for Regenerate — plain re-send via sendMessage lost the
   * attempt history. Requires capabilities.x_clio_retry_attempts. */
  retryTurn(sessionId: string, messageId: string, body: RetryTurnInput = {}): Promise<TurnAttempt> {
    return retrySessionTurn(this, sessionId, messageId, body);
  }

  /** GET /v1/sessions/{sid}/attempts — list recorded retry attempts. */
  listAttempts(sessionId: string): Promise<SessionAttemptsResult> {
    return fetchSessionAttempts(this, sessionId);
  }
}
