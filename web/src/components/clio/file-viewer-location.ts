import type { WorkspaceReference } from '@clio/core/v3';
import { workspaceFilePath } from '@/lib/workspace-file-path';
import { fileViewerIdentity, type FileViewerSource } from './file-viewer-source';

export interface FileViewerCrumb {
  label: string;
  /** The workspace folder this crumb names, when it is one. */
  folder?: string;
}

const ABSOLUTE = /^(?:[a-z]:[\\/]|[\\/])/iu;

function segments(path: string) {
  return path.split(/[\\/]+/u).filter(Boolean);
}

/** Where the file sits in its workspace, relative to the workspace folder; none for an outside file. */
export function fileViewerWorkspacePath(
  source: FileViewerSource,
  root?: string,
): string | undefined {
  const path =
    source.kind === 'workspace'
      ? source.path
      : source.kind === 'artifact'
        ? source.verifiedWorkspacePath
        : source.kind === 'resource'
          ? source.resource.workspace_path
          : undefined;
  if (!path) return undefined;
  const relative = workspaceFilePath(path, root);
  return ABSOLUTE.test(relative) ? undefined : relative.replace(/^\.\//u, '');
}

/** The file's full path on the machine that holds the workspace, when the root is known. */
export function fileViewerAbsolutePath(
  source: FileViewerSource,
  root?: string,
): string | undefined {
  const raw = source.kind === 'workspace' ? source.path : undefined;
  if (raw && ABSOLUTE.test(raw)) return raw;
  const relative = fileViewerWorkspacePath(source, root);
  if (!relative || !root) return undefined;
  const separator = root.includes('\\') && !root.includes('/') ? '\\' : '/';
  return `${root.replace(/[\\/]+$/u, '')}${separator}${relative.split('/').join(separator)}`;
}

/**
 * The frame bar's Where: a workspace file's folders and name, each folder
 * openable in Files; an artifact or upload outside the workspace shows its
 * own name (an artifact named with folders keeps them as plain crumbs).
 */
export function fileViewerCrumbs(source: FileViewerSource, root?: string): FileViewerCrumb[] {
  const workspacePath = fileViewerWorkspacePath(source, root);
  if (workspacePath) {
    const parts = segments(workspacePath);
    return parts.map((label, index) => ({
      label,
      folder: index < parts.length - 1 ? parts.slice(0, index + 1).join('/') : undefined,
    }));
  }
  const name = fileViewerIdentity(source).name;
  const parts = segments(name);
  return (parts.length ? parts : [name]).map((label) => ({ label }));
}

/**
 * The reference "@ Add to message" puts in the composer: the same reference
 * its @ picker inserts for this file. A file outside the workspace has none.
 */
export function fileViewerReference(source: FileViewerSource): WorkspaceReference | undefined {
  const identity = fileViewerIdentity(source);
  if (source.kind === 'workspace')
    return {
      kind: 'workspace_file',
      id: source.path,
      label: identity.name,
      detail: source.path,
      media_type: identity.mediaType,
      revision: '',
      navigation: { path: source.path },
    };
  if (source.kind === 'artifact')
    return {
      kind: 'artifact',
      id: source.artifact.id,
      label: identity.name,
      detail: identity.origin,
      media_type: identity.mediaType,
      revision: '',
      navigation: { artifact_id: source.artifact.id },
    };
  if (source.kind === 'resource')
    return {
      kind: 'resource',
      id: source.resource.id,
      label: identity.name,
      detail: identity.origin,
      media_type: identity.mediaType,
      revision: String(source.resource.revision),
      navigation: { workspace_id: source.workspaceId, resource_id: source.resource.id },
    };
  return undefined;
}
