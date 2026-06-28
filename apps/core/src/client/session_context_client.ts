import { applyDiffs, fetchMessageDiffs, fetchSessionDiffs, rejectDiffs } from './diffs.js';
import type {
  ApplySessionDiffsResult,
  DiffScopeInput,
  MessageDiffsResult,
  RejectSessionDiffsResult,
  SessionDiffsResult,
} from './diffs.js';
import {
  addSessionContextFile,
  compactSessionContext,
  fetchSessionContextFrame,
  fetchSessionContextFiles,
  fetchSessionContextFrames,
  fetchSessionContextState,
  patchSessionContextFile,
  removeSessionContextFile,
  uploadSessionAttachment,
} from './context.js';
import type {
  AddContextFileInput,
  AddContextFileResult,
  AttachmentFileInput,
  ContextFileListResult,
  ContextFramesResult,
  ContextFrameDetail,
  ContextFileMode,
  ContextState,
  PatchContextFileInput,
  UploadAttachmentResult,
} from './context.js';
import { SystemClient } from './system_client.js';

export class SessionContextClient extends SystemClient {
  /**
   * GET /v1/sessions/{id}/context/frames — the agent's time-series
   * memory snapshots for this session. Each frame represents a point
   * where the orchestrator persisted state. Used by the inspector's
   * Frames sub-section to give users a peek at the underlying memory
   * layer.
   */
  sessionContextFrames(sessionId: string): Promise<ContextFramesResult> {
    return fetchSessionContextFrames(this, sessionId);
  }

  /**
   * GET /v1/sessions/{id}/context/frames/{frame_id} — single-frame
   * detail (full payload, not just the summary that the list returns).
   */
  sessionContextFrame(sessionId: string, frameId: string): Promise<ContextFrameDetail> {
    return fetchSessionContextFrame(this, sessionId, frameId);
  }

  /**
   * GET /v1/sessions/{id}/context/state[?scope=<expert>] — per-expert
   * context-usage snapshot (token fullness, auto-compaction line, and the
   * /context-style category buckets). Omit `scope` for the session-default
   * expert. Vendor route, gated by `capabilities.x_clio_context_state`.
   */
  getContextState(sessionId: string, scope?: string): Promise<ContextState> {
    return fetchSessionContextState(this, sessionId, scope);
  }

  /**
   * POST /v1/sessions/{id}/context/compact[?scope=<expert>] — summarize the
   * live working set into one summary segment and return the updated state.
   * Rejects with a typed `CompactContextError` on the documented
   * nothing_to_compact (409) / compaction_unavailable (503) /
   * session_not_found (404) envelopes.
   */
  compactContext(sessionId: string, scope?: string): Promise<ContextState> {
    return compactSessionContext(this, sessionId, scope);
  }

  /**
   * GET /v1/sessions/{id}/context/files — the file index the agent
   * has been asked to keep in context for this session. Per
   * clio-agent develop #362.
   */
  sessionContextFiles(sessionId: string): Promise<ContextFileListResult> {
    return fetchSessionContextFiles(this, sessionId);
  }

  /**
   * POST /v1/sessions/{id}/context/files — attach a file to the
   * session's context. Existing rows for the same path are upserted.
   */
  addContextFile(sessionId: string, body: AddContextFileInput): Promise<AddContextFileResult> {
    return addSessionContextFile(this, sessionId, body);
  }

  /**
   * POST /v1/sessions/{id}/attachments — upload a file's BYTES into the
   * session workspace. clio writes them under `.clio/attachments/{sid}/`
   * and registers them as a context file the agent reads next turn.
   *
   * Encoded as base64-in-JSON, NOT multipart, on purpose: the CLIO
   * Desktop transports HTTP through a Tauri/ureq bridge that forwards
   * only UTF-8 string bodies (a `FormData` stringifies to
   * "[object FormData]"), and over an SSH tunnel the body must survive
   * that same bridge — so multipart cannot work in the shipped desktop.
   * base64 rides the JSON path the proxy + tunnel already handle, which
   * is also what lets a LOCAL file reach a REMOTE (ssh) agent: the bytes
   * travel the tunnel and land in the remote workspace.
   *
   * `file` is structurally a browser `File` (name/type/arrayBuffer) but
   * typed minimally so it's unit-testable without a DOM.
   */
  async uploadAttachment(
    sessionId: string,
    file: AttachmentFileInput,
    mode: ContextFileMode = 'read',
  ): Promise<UploadAttachmentResult> {
    return uploadSessionAttachment(this, sessionId, file, mode);
  }

  /**
   * Change a context file's mode (read/edit/pin). clio's
   * POST /v1/sessions/{id}/context/files endpoint upserts by path, so
   * we POST the new mode (no separate PATCH endpoint exists). The
   * method name stays patchContextFile for caller-side clarity.
   */
  patchContextFile(sessionId: string, body: PatchContextFileInput): Promise<unknown> {
    return patchSessionContextFile(this, sessionId, body);
  }

  /**
   * DELETE /v1/sessions/{id}/context/files — drop a file from the
   * session's context. clio reads `path` from the JSON BODY only (it
   * ignores a `?path=` query), so a query-only delete 204s but is a
   * silent no-op (the file reappears on refetch). Send it in the body.
   */
  removeContextFile(sessionId: string, path: string): Promise<void> {
    return removeSessionContextFile(this, sessionId, path);
  }

  /** POST /v1/sessions/{id}/diffs/apply — apply pending diffs. Pass
   * `paths` to scope to specific files; empty body applies all.
   * `write_errors` carries per-path failures when the in-memory diff
   * status flipped to `applied` but the disk write blew up (perm
   * denied, disk full, …). Callers should surface it. */
  applySessionDiffs(
    sessionId: string,
    body: DiffScopeInput = {},
  ): Promise<ApplySessionDiffsResult> {
    return applyDiffs(this, sessionId, body);
  }

  /** POST /v1/sessions/{id}/diffs/reject — discard pending diffs. */
  rejectSessionDiffs(
    sessionId: string,
    body: DiffScopeInput = {},
  ): Promise<RejectSessionDiffsResult> {
    return rejectDiffs(this, sessionId, body);
  }

  /**
   * GET /v1/sessions/{id}/diffs — every proposed-but-not-applied diff
   * across the session. Used as a discovery entry point so the user
   * can see all pending diffs without scrolling the transcript.
   */
  sessionDiffs(sessionId: string): Promise<SessionDiffsResult> {
    return fetchSessionDiffs(this, sessionId);
  }

  /**
   * GET /v1/sessions/{id}/messages/{msg_id}/diffs — diffs scoped to a
   * single message (per-turn drill-down).
   */
  messageDiffs(sessionId: string, messageId: string): Promise<MessageDiffsResult> {
    return fetchMessageDiffs(this, sessionId, messageId);
  }
}
