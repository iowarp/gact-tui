import type { Artifact, ClioRepository, WorkspaceResource } from '@clio/core/v3';
import { verifyArtifactRecovery } from './artifact-custody';

/** File custody determines reads and copy behavior; the format only determines rendering. */
export type FileViewerSource =
  | {
      kind: 'provided';
      name: string;
      mediaType: string;
      size?: number;
      origin: string;
      readBytes: () => Promise<Uint8Array>;
      workspaceId?: undefined;
    }
  | {
      kind: 'artifact';
      artifact: Artifact;
      workspaceId: string;
      verifiedWorkspacePath?: string;
      unavailable?: boolean;
    }
  | { kind: 'resource'; resource: WorkspaceResource; workspaceId: string }
  | { kind: 'workspace'; path: string; mediaType: string; size?: number; workspaceId: string };

export function fileViewerIdentity(source: FileViewerSource) {
  if (source.kind === 'provided')
    return {
      name: source.name,
      mediaType: source.mediaType,
      size: source.size,
      origin: source.origin,
      available: true,
    };
  if (source.kind === 'artifact') {
    return {
      name: source.artifact.name,
      mediaType: source.artifact.media_type,
      size: source.artifact.size,
      origin: 'Generated output',
      available: !source.unavailable,
    };
  }
  if (source.kind === 'resource') {
    return {
      name: source.resource.name,
      mediaType: source.resource.detected_mime || source.resource.claimed_mime,
      size: source.resource.received_size,
      origin: 'Uploaded file',
      available: source.resource.state === 'ready',
    };
  }
  return {
    name: source.path.split(/[\\/]+/).at(-1) || source.path,
    mediaType: source.mediaType,
    size: source.size,
    origin: 'Workspace file',
    available: true,
  };
}

/** Reads original bytes through the connected agent's transport, never a derivative URL. */
export async function readFileViewerBytes(repository: ClioRepository, source: FileViewerSource) {
  if (source.kind === 'provided') return source.readBytes();
  if (source.kind === 'artifact') {
    if (!source.verifiedWorkspacePath) return repository.readArtifactBytesFor(source.artifact);
    const bytes = await repository.readWorkspaceFileBytes(
      source.workspaceId,
      source.verifiedWorkspacePath,
    );
    await verifyArtifactRecovery(source.artifact, bytes, source.verifiedWorkspacePath);
    return bytes;
  }
  if (source.kind === 'resource')
    return repository.resourceContent(source.workspaceId, source.resource.id);
  return repository.readWorkspaceFileBytes(source.workspaceId, source.path);
}
