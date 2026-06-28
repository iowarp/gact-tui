import { HttpError } from './http_error.js';
import {
  bytesToBase64,
  normalizeWorkspaceMediaType,
  type HttpTransport,
} from './transport.js';
import type {
  AddContextFileInput,
  AddContextFileResult,
  AttachmentFileInput,
  ContextFileListResult,
  ContextFileMode,
  ContextFrameDetail,
  ContextFramesResult,
  ContextState,
  PatchContextFileInput,
  ReadWorkspaceFileResult,
  UploadAttachmentResult,
  WorkspaceFileListResult,
} from './context_types.js';

export * from './context_types.js';

type ContextTransport = Pick<HttpTransport, 'get' | 'post' | 'request' | 'response'>;

/**
 * Typed reason for a failed `compactContext` call. The backend signals
 * these via flat `{error: "..."}` envelopes with specific HTTP statuses:
 *  - 409 `nothing_to_compact` — no live segments to summarize.
 *  - 503 `compaction_unavailable` — no LM bound / the summary failed.
 *  - 404 `session_not_found` — unknown session id.
 */
export type CompactErrorReason =
  | 'nothing_to_compact'
  | 'compaction_unavailable'
  | 'session_not_found'
  | 'unknown';

export class CompactContextError extends Error {
  override name = 'CompactContextError';
  constructor(
    public reason: CompactErrorReason,
    public status: number,
    message?: string,
  ) {
    super(message ?? reason);
  }
}

/**
 * Map an HttpError off the compact route to a typed CompactContextError.
 * clio returns a flat `{error: "<reason>"}` body (not the nested §14
 * envelope), so we parse it directly and fall back on the status code.
 */
function toCompactError(err: HttpError): CompactContextError {
  let reason: CompactErrorReason = 'unknown';
  try {
    const parsed = JSON.parse(err.body) as { error?: unknown };
    if (typeof parsed?.error === 'string') {
      const e = parsed.error;
      if (
        e === 'nothing_to_compact' ||
        e === 'compaction_unavailable' ||
        e === 'session_not_found'
      ) {
        reason = e;
      }
    }
  } catch {
    // body wasn't JSON; fall through to status-based mapping.
  }
  if (reason === 'unknown') {
    if (err.status === 409) reason = 'nothing_to_compact';
    else if (err.status === 503) reason = 'compaction_unavailable';
    else if (err.status === 404) reason = 'session_not_found';
  }
  return new CompactContextError(reason, err.status, err.message);
}

export function fetchSessionContextFrames(
  client: ContextTransport,
  sessionId: string,
): Promise<ContextFramesResult> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/context/frames`,
  );
}

export function fetchSessionContextFrame(
  client: ContextTransport,
  sessionId: string,
  frameId: string,
): Promise<ContextFrameDetail> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/context/frames/${encodeURIComponent(frameId)}`,
  );
}

/**
 * GET /v1/sessions/{id}/context/state[?scope=<expert>] — the per-expert
 * context-usage snapshot (SPEC §6.9 vendor `x_clio_context_state`). Omit
 * `scope` for the session-default expert.
 */
export function fetchSessionContextState(
  client: ContextTransport,
  sessionId: string,
  scope?: string,
): Promise<ContextState> {
  const q = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/context/state${q}`,
  );
}

/**
 * POST /v1/sessions/{id}/context/compact[?scope=<expert>] — LLM-summarize
 * the live working set into a single summary segment and return the updated
 * ContextState. Throws a typed {@link CompactContextError} on the documented
 * 409/503/404 envelopes.
 */
export async function compactSessionContext(
  client: ContextTransport,
  sessionId: string,
  scope?: string,
): Promise<ContextState> {
  const q = scope ? `?scope=${encodeURIComponent(scope)}` : '';
  try {
    return await client.post(
      `/v1/sessions/${encodeURIComponent(sessionId)}/context/compact${q}`,
      {},
    );
  } catch (err) {
    if (err instanceof HttpError) {
      throw toCompactError(err);
    }
    throw err;
  }
}

export function fetchSessionContextFiles(
  client: ContextTransport,
  sessionId: string,
): Promise<ContextFileListResult> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/context/files`,
  );
}

export function addSessionContextFile(
  client: ContextTransport,
  sessionId: string,
  body: AddContextFileInput,
): Promise<AddContextFileResult> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/context/files`,
    body,
  );
}

export async function uploadSessionAttachment(
  client: ContextTransport,
  sessionId: string,
  file: AttachmentFileInput,
  mode: ContextFileMode = 'read',
): Promise<UploadAttachmentResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const b64 = bytesToBase64(bytes);
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/attachments`,
    {
      file: b64,
      filename: file.name,
      mime_type: file.type || 'application/octet-stream',
      mode,
    },
  );
}

export function patchSessionContextFile(
  client: ContextTransport,
  sessionId: string,
  body: PatchContextFileInput,
): Promise<unknown> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/context/files`,
    body,
  );
}

export function removeSessionContextFile(
  client: ContextTransport,
  sessionId: string,
  path: string,
): Promise<void> {
  return client.request(
    `/v1/sessions/${encodeURIComponent(sessionId)}/context/files`,
    'DELETE',
    { path },
  );
}

export function fetchWorkspaceFileList(
  client: ContextTransport,
  workspaceId: string,
): Promise<WorkspaceFileListResult> {
  return client.get(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/files`,
  );
}

export async function readWorkspaceBinaryFile(
  client: ContextTransport,
  workspaceId: string,
  path: string,
): Promise<ReadWorkspaceFileResult> {
  const res = await client.response(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/files/read?path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) {
    throw new Error(`readWorkspaceFile ${path}: HTTP ${res.status}`);
  }
  const sourceMediaType =
    res.headers.get('content-type')?.split(';')[0]?.trim() ||
    'application/octet-stream';
  const mediaType = normalizeWorkspaceMediaType(path, sourceMediaType);
  const buf = await res.arrayBuffer();
  // ArrayBuffer -> base64 without blowing the call stack on large files.
  const bytes = new Uint8Array(buf);
  const data = bytesToBase64(bytes);
  return {
    path,
    display_path: path,
    size: bytes.length,
    media_type: mediaType,
    source_media_type: sourceMediaType,
    encoding: 'base64',
    data,
  };
}
