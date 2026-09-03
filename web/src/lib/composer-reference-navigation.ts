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

/**
 * What navigating one reference did.
 *
 * A reference the service served can still name a destination this client
 * cannot reach — a change that has left the session, a source recorded as a
 * `file://` URI, a context record with no conversation. Those are dead ends,
 * and each one is reported rather than absorbed: revealing the open session
 * instead would read as success and leave the person looking at the wrong
 * thing.
 */
export type ComposerReferenceNavigationOutcome =
  | { status: 'opened' }
  | { status: 'unresolved'; reason: string };

const OPENED: ComposerReferenceNavigationOutcome = { status: 'opened' };

function unresolved(reason: string): ComposerReferenceNavigationOutcome {
  return { reason, status: 'unresolved' };
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
}: ComposerReferenceNavigation): Promise<ComposerReferenceNavigationOutcome> {
  const targetWorkspaceId = stringNavigation(reference, 'workspace_id') || workspaceId;

  /** The conversation destination every session-scoped kind shares. */
  const openOwningSession = (): ComposerReferenceNavigationOutcome | undefined => {
    const targetSessionId = stringNavigation(reference, 'session_id');
    if (!targetSessionId) return undefined;
    if (targetSessionId === sessionId) {
      revealSession();
      return OPENED;
    }
    openSession(targetWorkspaceId, targetSessionId);
    return OPENED;
  };

  switch (reference.kind) {
    case 'workspace_file': {
      const path = stringNavigation(reference, 'path') || reference.id;
      if (!path) return unresolved('This reference names no workspace path.');
      openWorkspaceFile(path);
      return OPENED;
    }
    case 'resource': {
      openWorkspaceResource(
        resources[reference.id] ?? (await repository.resource(targetWorkspaceId, reference.id)),
      );
      return OPENED;
    }
    case 'artifact': {
      const existing = artifacts.find((artifact) => artifact.id === reference.id);
      openArtifact(
        existing ?? artifactDetailEntity(await repository.artifactDetail(reference.id), sessionId),
      );
      return OPENED;
    }
    case 'diff': {
      const path = stringNavigation(reference, 'path');
      const diff = diffs.find((candidate) => candidate.path === path);
      if (diff) {
        openDiff(diff);
        return OPENED;
      }
      if (path) {
        openWorkspaceFile(path);
        return OPENED;
      }
      return unresolved('This change is no longer in the session and the reference names no file.');
    }
    case 'evidence_source': {
      const resourceId = stringNavigation(reference, 'resource_id');
      if (resourceId) {
        openWorkspaceResource(
          resources[resourceId] ?? (await repository.resource(targetWorkspaceId, resourceId)),
        );
        return OPENED;
      }
      const uri = stringNavigation(reference, 'uri');
      if (/^https?:\/\//iu.test(uri)) {
        openExternal(uri);
        return OPENED;
      }
      return (
        openOwningSession() ??
        unresolved(
          uri
            ? `This source points at ${uri}, which is not a workspace resource or a web address.`
            : 'This source names no workspace resource or address to open.',
        )
      );
    }
    case 'context_frame':
    case 'plan':
    case 'session':
    case 'agent_run':
      return openOwningSession() ?? unresolved('This reference names no conversation to open.');
    case 'unknown':
      return unresolved('This version of the app has no way to open this kind of reference.');
  }
}

function stringNavigation(reference: WorkspaceReference, key: string): string {
  const value = reference.navigation[key];
  return typeof value === 'string' ? value : '';
}
