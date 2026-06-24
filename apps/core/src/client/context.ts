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
  PatchContextFileInput,
  ReadWorkspaceFileResult,
  UploadAttachmentResult,
  WorkspaceFileListResult,
} from './context_types.js';

export * from './context_types.js';

type ContextTransport = Pick<HttpTransport, 'get' | 'post' | 'request' | 'response'>;

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
