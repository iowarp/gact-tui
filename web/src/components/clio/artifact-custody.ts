import { TransportError, type Artifact, type WorkspaceFileEntry } from '@clio/core/v3';

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

/** A mutable workspace file is not a saved version until its bytes prove that identity. */
export class ArtifactRecoveryError extends Error {
  constructor(
    message: string,
    readonly workspacePath: string,
  ) {
    super(message);
    this.name = 'ArtifactRecoveryError';
  }
}

/** Require the recorded checksum before substituting workspace bytes for missing artifact bytes. */
export async function verifyArtifactRecovery(
  artifact: Artifact,
  bytes: Uint8Array,
  path: string,
): Promise<void> {
  if (!artifact.sha256 || !/^[a-f0-9]{64}$/iu.test(artifact.sha256))
    throw new ArtifactRecoveryError(
      'The saved version is unavailable and has no recorded checksum. The current workspace file must be opened separately.',
      path,
    );
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
  const actual = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual !== artifact.sha256.toLowerCase())
    throw new ArtifactRecoveryError(
      'The saved version is unavailable. The current workspace file has changed since that version.',
      path,
    );
}

function fileName(path: string): string {
  return (
    path
      .split(/[\\/]+/u)
      .filter(Boolean)
      .at(-1) ?? path
  );
}
