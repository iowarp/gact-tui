import type { Artifact, ClioRepository, WorkspaceResource } from '@clio/core/v3';

/** File custody determines reads and copy behavior; the format only determines rendering. */
export type FileViewerSource =
  | { kind: 'artifact'; artifact: Artifact; workspaceId: string }
  | { kind: 'resource'; resource: WorkspaceResource; workspaceId: string }
  | { kind: 'workspace'; path: string; mediaType: string; size?: number; workspaceId: string };

export function fileViewerIdentity(source: FileViewerSource) {
  if (source.kind === 'artifact') {
    return {
      name: source.artifact.name,
      mediaType: source.artifact.media_type,
      size: source.artifact.size,
      origin: 'Generated output',
      available: true,
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
export function readFileViewerBytes(repository: ClioRepository, source: FileViewerSource) {
  if (source.kind === 'artifact') return repository.readArtifactBytesFor(source.artifact);
  if (source.kind === 'resource')
    return repository.resourceContent(source.workspaceId, source.resource.id);
  return repository.readWorkspaceFileBytes(source.workspaceId, source.path);
}
