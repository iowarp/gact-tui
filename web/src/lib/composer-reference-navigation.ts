import type {
  Artifact,
  ClioRepository,
  SessionDiff,
  WorkspaceReference,
  WorkspaceResource,
} from '@clio/core/v3';
import { artifactDetailEntity } from './session-artifacts';

interface ComposerReferenceNavigation {
  artifacts: readonly Artifact[];
  diffs: readonly SessionDiff[];
  openArtifact: (artifact: Artifact) => void;
  openDiff: (diff: SessionDiff) => void;
  openExternal: (uri: string) => void;
  openSession: (workspaceId: string, sessionId: string) => void;
  openWorkspaceFile: (path: string) => void;
  openWorkspaceResource: (resource: WorkspaceResource) => void;
  reference: WorkspaceReference;
  repository: Pick<ClioRepository, 'artifactDetail' | 'resource'>;
  resources: Readonly<Record<string, WorkspaceResource | undefined>>;
  revealSession: () => void;
  sessionId: string;
  workspaceId: string;
}

/** Resolve one structured composer reference into its authoritative workspace destination. */
export async function navigateComposerReference({
  artifacts,
  diffs,
  openArtifact,
  openDiff,
  openExternal,
  openSession,
  openWorkspaceFile,
  openWorkspaceResource,
  reference,
  repository,
  resources,
  revealSession,
  sessionId,
  workspaceId,
}: ComposerReferenceNavigation): Promise<void> {
  const targetWorkspaceId = stringNavigation(reference, 'workspace_id') || workspaceId;
  if (reference.kind === 'workspace_file') {
    openWorkspaceFile(stringNavigation(reference, 'path') || reference.id);
    return;
  }
  if (reference.kind === 'resource') {
    openWorkspaceResource(
      resources[reference.id] ?? (await repository.resource(targetWorkspaceId, reference.id)),
    );
    return;
  }
  if (reference.kind === 'artifact') {
    const existing = artifacts.find((artifact) => artifact.id === reference.id);
    openArtifact(
      existing ?? artifactDetailEntity(await repository.artifactDetail(reference.id), sessionId),
    );
    return;
  }
  if (reference.kind === 'diff') {
    const path = stringNavigation(reference, 'path');
    const diff = diffs.find((candidate) => candidate.path === path);
    if (diff) openDiff(diff);
    else if (path) openWorkspaceFile(path);
    return;
  }
  if (reference.kind === 'evidence_source') {
    const resourceId = stringNavigation(reference, 'resource_id');
    if (resourceId) {
      openWorkspaceResource(
        resources[resourceId] ?? (await repository.resource(targetWorkspaceId, resourceId)),
      );
      return;
    }
    const uri = stringNavigation(reference, 'uri');
    if (/^https?:\/\//iu.test(uri)) {
      openExternal(uri);
      return;
    }
  }
  const targetSessionId = stringNavigation(reference, 'session_id');
  if (targetSessionId && targetSessionId !== sessionId) {
    openSession(targetWorkspaceId, targetSessionId);
    return;
  }
  revealSession();
}

function stringNavigation(reference: WorkspaceReference, key: string): string {
  const value = reference.navigation[key];
  return typeof value === 'string' ? value : '';
}
