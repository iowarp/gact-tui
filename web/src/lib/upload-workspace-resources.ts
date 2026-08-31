import type {
  ComposerMessagePart,
  ComposerRepository,
  WorkspaceResource,
} from '@clio/core/v3';
import type { FileUIPart } from 'ai';

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
  workspaceId,
}: {
  files: readonly FileUIPart[];
  onProgress?: (progress: ResourceUploadProgress) => void;
  repository: ComposerRepository;
  workspaceId: string;
}): Promise<{ parts: ComposerMessagePart[]; resources: WorkspaceResource[] }> {
  const resources: WorkspaceResource[] = [];

  for (const file of files) {
    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(`Unable to read ${file.filename ?? 'the attachment'} for upload.`);
    }
    const blob = await response.blob();
    const name = file.filename?.trim() || 'attachment';
    const mediaType = file.mediaType || blob.type || 'application/octet-stream';
    const clientUploadId = await uploadFingerprint(name, mediaType, blob);
    const created = await repository.createResource(workspaceId, {
      clientUploadId,
      mediaType,
      name,
      size: blob.size,
    });
    resources.push(created);

    if (created.received_size > blob.size) {
      throw new Error(`${name} has an invalid server upload offset.`);
    }
    if (created.state === 'failed' || created.state === 'quarantined') {
      throw new Error(created.failure || `${name} was not accepted by resource custody.`);
    }

    onProgress?.({ filename: name, loaded: created.received_size, total: blob.size });
    for (let offset = created.received_size; offset < blob.size; offset += UPLOAD_CHUNK_BYTES) {
      const chunk = blob.slice(offset, Math.min(offset + UPLOAD_CHUNK_BYTES, blob.size));
      await repository.appendResourceBytes(
        workspaceId,
        created.id,
        offset,
        new Uint8Array(await chunk.arrayBuffer()),
      );
      onProgress?.({
        filename: name,
        loaded: Math.min(offset + chunk.size, blob.size),
        total: blob.size,
      });
    }

    const completed =
      created.state === 'ready' ? created : await repository.resource(workspaceId, created.id);
    resources[resources.length - 1] = completed;
    if (completed.state !== 'ready') {
      throw new Error(completed.failure || `${name} was not accepted by resource custody.`);
    }
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
