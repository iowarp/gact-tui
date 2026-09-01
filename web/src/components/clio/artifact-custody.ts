import {
  TransportError,
  type Artifact,
  type WorkspaceFileEntry,
} from '@clio/core/v3';

/** Returns the sole same-named workspace file that can recover a historical artifact. */
export function uniqueWorkspaceArtifactFile(
  artifact: Artifact,
  workspaceId: string,
  files: readonly WorkspaceFileEntry[],
): WorkspaceFileEntry | undefined {
  if (artifact.workspace_id && artifact.workspace_id !== workspaceId) return undefined;
  const matches = files.filter(
    (entry) => entry.type === 'file' && fileName(entry.path) === artifact.name,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

/** Identifies an absent artifact payload that may be recovered through workspace custody. */
export function isMissingArtifactPayload(error: unknown): boolean {
  return error instanceof TransportError && error.status === 404;
}

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? path
  );
}
