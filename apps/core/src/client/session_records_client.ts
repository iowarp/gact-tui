import type { Session } from '../wire/types.js';
import {
  createSessionRecord,
  exportSessionRecord,
  fetchSession,
  fetchSessions,
  fetchSharedSession,
  forkSessionRecord,
  importSessionRecord,
  patchSessionRecord,
  removeSession,
  shareSessionRecord,
  type CreateSessionInput,
  type ExportSessionResult,
  type ForkSessionInput,
  type ImportSessionInput,
  type PatchSessionInput,
  type SessionsOptions,
  type SessionsResult,
  type SharedSessionResult,
  type ShareSessionInput,
  type ShareSessionResult,
} from './session.js';
import { SessionContextClient } from './session_context_client.js';

export class SessionRecordsClient extends SessionContextClient {
  /** GET /v1/sessions/{id} — single-session detail. Used when the
   * sessions list is paginated and the cached row needs refreshing. */
  getSession(sessionId: string): Promise<Session> {
    return fetchSession(this, sessionId);
  }

  sessions(options: SessionsOptions = {}): Promise<SessionsResult> {
    return fetchSessions(this, options);
  }

  session(id: string): Promise<Session> {
    return fetchSession(this, id);
  }

  /** POST /v1/sessions — creates a new session and returns its id. */
  createSession(input: CreateSessionInput = {}): Promise<Session> {
    return createSessionRecord(this, input);
  }

  /** DELETE /v1/sessions/{id} — removes a session and returns 204. */
  deleteSession(sessionId: string): Promise<void> {
    return removeSession(this, sessionId);
  }

  /**
   * POST /v1/sessions/import — recreate a session from its export
   * JSON blob. Returns the new Session. Companion to exportSession.
   */
  importSession(body: ImportSessionInput): Promise<Session> {
    return importSessionRecord(this, body);
  }

  /**
   * GET /v1/shared/{token} — load a read-only shared session view by
   * the share token a sender pasted into chat. Returns the static
   * transcript snapshot.
   */
  loadSharedSession(token: string): Promise<SharedSessionResult> {
    return fetchSharedSession(this, token);
  }

  /**
   * GET /v1/sessions/{id}/export — full session payload as JSON
   * (messages, metadata, agent + model + workspace IDs). Used for
   * 'Export as JSON' downloads from the session kebab menu.
   */
  exportSession(sessionId: string): Promise<ExportSessionResult> {
    return exportSessionRecord(this, sessionId);
  }

  /**
   * POST /v1/sessions/{id}/fork — branch the session at its current
   * tail (or at a specific message). Returns the new Session.
   */
  forkSession(sessionId: string, body: ForkSessionInput = {}): Promise<Session> {
    return forkSessionRecord(this, sessionId, body);
  }

  /**
   * POST /v1/sessions/{id}/share — create a read-only share. Returns
   * the share token + URL the user can hand to anyone.
   */
  shareSession(sessionId: string, body: ShareSessionInput = {}): Promise<ShareSessionResult> {
    return shareSessionRecord(this, sessionId, body);
  }

  /**
   * PATCH /v1/sessions/{id} — update session metadata (title, model,
   * agent mode, archived). Used by the composer's model picker + perm
   * mode toggle to push the user's selection to the backend.
   */
  patchSession(sessionId: string, patch: PatchSessionInput): Promise<Session> {
    return patchSessionRecord(this, sessionId, patch);
  }
}
