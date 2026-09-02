import type { ComposerMessagePart, ComposerRepository, WorkspaceResource } from '@clio/core/v3';
import type { FileUIPart } from 'ai';
import {
  RESOURCE_READY_POLL_ATTEMPTS,
  RESOURCE_READY_POLL_BASE_MS,
  RESOURCE_READY_POLL_MAX_MS,
} from '@/lib/runtime-limits';

const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const FINGERPRINT_SAMPLE_BYTES = 64 * 1024;

export interface ResourceUploadProgress {
  filename: string;
  loaded: number;
  total: number;
}

async function uploadFingerprint(name: string, mediaType: string, blob: Blob): Promise<string> {
  const prefix = new TextEncoder().encode(`${name}\u0000${mediaType}\u0000${blob.size}\u0000`);
  const first = new Uint8Array(
    await blob.slice(0, Math.min(blob.size, FINGERPRINT_SAMPLE_BYTES)).arrayBuffer(),
  );
  const lastStart = Math.max(first.byteLength, blob.size - FINGERPRINT_SAMPLE_BYTES);
  const last = new Uint8Array(await blob.slice(lastStart).arrayBuffer());
  const fingerprintInput = new Uint8Array(prefix.byteLength + first.byteLength + last.byteLength);
  fingerprintInput.set(prefix, 0);
  fingerprintInput.set(first, prefix.byteLength);
  fingerprintInput.set(last, prefix.byteLength + first.byteLength);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', fingerprintInput));
  return `browser-${Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

/** Upload prompt attachments into authoritative workspace resource custody. */
export async function uploadWorkspaceResources({
  files,
  onProgress,
  repository,
  signal,
  workspaceId,
}: {
  files: readonly FileUIPart[];
  onProgress?: (progress: ResourceUploadProgress) => void;
  repository: ComposerRepository;
  signal?: AbortSignal;
  workspaceId: string;
}): Promise<{ parts: ComposerMessagePart[]; resources: WorkspaceResource[] }> {
  const resources: WorkspaceResource[] = [];

  for (const file of files) {
    const response = await fetch(file.url, { signal });
    if (!response.ok) {
      throw new Error(`Unable to read ${file.filename ?? 'the attachment'} for upload.`);
    }
    const blob = await response.blob();
    const name = file.filename?.trim() || 'attachment';
    const mediaType = file.mediaType || blob.type || 'application/octet-stream';
    const clientUploadId = await uploadFingerprint(name, mediaType, blob);
    const created = await repository.createResource(
      workspaceId,
      { clientUploadId, mediaType, name, size: blob.size },
      signal,
    );
    resources.push(created);

    if (created.received_size > blob.size) {
      throw new Error(`${name} has an invalid server upload offset.`);
    }
    assertNotTerminal(name, created);

    onProgress?.({ filename: name, loaded: created.received_size, total: blob.size });
    for (let offset = created.received_size; offset < blob.size; offset += UPLOAD_CHUNK_BYTES) {
      const chunk = blob.slice(offset, Math.min(offset + UPLOAD_CHUNK_BYTES, blob.size));
      await repository.appendResourceBytes(
        workspaceId,
        created.id,
        offset,
        new Uint8Array(await chunk.arrayBuffer()),
        signal,
      );
      onProgress?.({
        filename: name,
        loaded: Math.min(offset + chunk.size, blob.size),
        total: blob.size,
      });
    }

    const completed =
      created.state === 'ready'
        ? created
        : await awaitRegisteredResource({ created, name, repository, signal, workspaceId });
    // Trust the record, not the request: an idempotent replay can come back
    // `ready` for a resource whose bytes the service does not actually hold.
    if (completed.received_size < blob.size) {
      throw new Error(
        `${name} is registered as complete, but resource custody holds ${completed.received_size} of ${blob.size} bytes.`,
      );
    }
    resources[resources.length - 1] = completed;
  }

  return {
    parts: resources.map((resource) => ({
      name: resource.name,
      resource_id: resource.id,
      resource_revision: String(resource.revision),
      type: 'resource_ref' as const,
    })),
    resources,
  };
}

/**
 * Read the resource back until custody registers it.
 *
 * `uploading` is transient - the service still has hashing and type detection
 * to do after the last chunk lands - so it is waited out rather than reported
 * as a refusal. `failed` and `quarantined` are terminal and are reported with
 * the service's own text. Running out of attempts is neither: it says what the
 * service last reported and hands the retry back to the person, because the
 * bytes are already in custody and a retry resumes.
 */
async function awaitRegisteredResource({
  created,
  name,
  repository,
  signal,
  workspaceId,
}: {
  created: WorkspaceResource;
  name: string;
  repository: ComposerRepository;
  signal?: AbortSignal;
  workspaceId: string;
}): Promise<WorkspaceResource> {
  let delay = RESOURCE_READY_POLL_BASE_MS;
  for (let attempt = 0; ; attempt += 1) {
    const current = await repository.resource(workspaceId, created.id, signal);
    if (current.state === 'ready') return current;
    assertNotTerminal(name, current);
    if (attempt + 1 >= RESOURCE_READY_POLL_ATTEMPTS) {
      throw new Error(
        `${name} is still "${current.state}" in resource custody. The uploaded bytes are kept, so sending again resumes from them.`,
      );
    }
    await abortableDelay(delay, signal);
    delay = Math.min(delay * 2, RESOURCE_READY_POLL_MAX_MS);
  }
}

function assertNotTerminal(name: string, resource: WorkspaceResource): void {
  if (resource.state !== 'failed' && resource.state !== 'quarantined') return;
  throw new Error(
    resource.failure ||
      (resource.state === 'quarantined'
        ? `${name} was quarantined by resource custody.`
        : `${name} was rejected by resource custody.`),
  );
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(uploadCancelled());
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(uploadCancelled());
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function uploadCancelled(): Error {
  const error = new Error('The upload was cancelled.');
  error.name = 'AbortError';
  return error;
}
