import {
  bytesToBase64,
  normalizeWorkspaceMediaType,
  type HttpTransport,
} from './transport.js';
import type { ReadWorkspaceFileResult } from './context_types.js';
import type { WorkspaceFileEntry } from '../wire/types.js';

/**
 * One entry from `GET /v1/agent-blueprints/{id}/files` — a flat recursive
 * listing of a blueprint's root directory, paths forward-slash-relative to
 * the root regardless of host OS. Structurally identical to
 * `WorkspaceFileEntry` (same `{path, type, size?, modified?}` shape the
 * backend's `WorkspaceFileEntry` wire type already serves for workspaces) —
 * reused directly rather than diverging the shape.
 */
export type BlueprintFileEntry = WorkspaceFileEntry;

export interface BlueprintFilesResult {
  entries: BlueprintFileEntry[];
}

/**
 * Optional scoping for the blueprint-files routes. `sessionId`, when given,
 * resolves a PATH-activated blueprint (a session whose
 * `active_agent_blueprint_path` names this exact blueprint id) even when the
 * id isn't in the installed/discovery catalog — the demo case
 * (`earthscope-flat`).
 */
export interface BlueprintFilesOptions {
  workspaceId?: string;
  sessionId?: string;
}

type BlueprintFilesTransport = Pick<HttpTransport, 'get' | 'response'>;

function blueprintFilesQuery(opts: BlueprintFilesOptions): URLSearchParams {
  const qs = new URLSearchParams();
  if (opts.workspaceId) qs.set('workspace_id', opts.workspaceId);
  if (opts.sessionId) qs.set('session_id', opts.sessionId);
  return qs;
}

/**
 * GET /v1/agent-blueprints/{id}/files[?workspace_id=&session_id=] — flat
 * recursive listing of a blueprint's root directory. Unknown blueprint id
 * throws a 404 `HttpError` (via `client.get`).
 */
export function fetchAgentBlueprintFiles(
  client: BlueprintFilesTransport,
  blueprintId: string,
  opts: BlueprintFilesOptions = {},
): Promise<BlueprintFilesResult> {
  const qs = blueprintFilesQuery(opts);
  const q = qs.size ? `?${qs}` : '';
  return client.get(`/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/files${q}`);
}

/**
 * GET /v1/agent-blueprints/{id}/files/read?path=…[&workspace_id=&session_id=]
 * — read one blueprint file's raw bytes. Mirrors `readWorkspaceBinaryFile`
 * (context.ts) exactly: fetch through `client.response()`, normalize the
 * declared content-type via `normalizeWorkspaceMediaType` (upgrades a
 * generic `text/plain` to `text/markdown` by the `.md` extension — what
 * routes `.md` files to the Markdown-module rendering path instead of a raw-
 * text pane), and base64-encode the bytes into the shared
 * `ReadWorkspaceFileResult` shape so the existing
 * `decodeWorkspaceFilePreview` (apps/web/src/session/filePreview.ts) can
 * consume it with zero changes.
 */
export async function readAgentBlueprintFile(
  client: BlueprintFilesTransport,
  blueprintId: string,
  path: string,
  opts: BlueprintFilesOptions = {},
): Promise<ReadWorkspaceFileResult> {
  const qs = blueprintFilesQuery(opts);
  qs.set('path', path);
  const res = await client.response(
    `/v1/agent-blueprints/${encodeURIComponent(blueprintId)}/files/read?${qs}`,
  );
  if (!res.ok) {
    throw new Error(`readAgentBlueprintFile ${path}: HTTP ${res.status}`);
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
