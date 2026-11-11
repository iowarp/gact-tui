import type { Artifact, SessionDiff, WorkspaceReference } from '@clio/core/v3';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { navigateComposerReferenceOrToast } from '@/lib/composer-reference-navigation';
import { openExternalUrlOrToast } from '@/tauri/external-url';
import { useRepository } from './use-repository';
import type { useWorkbenchNavigation } from './use-workbench-navigation';
import type { useWorkspaceResourceMap } from './use-workspace-resource-map';

/**
 * Opens a reference from the composer or the transcript where it lives: an
 * artifact, a diff, a workspace file or resource, another session, or an
 * external link. A reference that cannot be opened is reported as a toast.
 */
export function useComposerReferenceNavigation({
  artifacts,
  diffs,
  navigation,
  resources,
  sessionId,
  workspaceId,
}: {
  artifacts: readonly Artifact[];
  /** The session's diffs, while they are loaded. */
  diffs: readonly SessionDiff[] | undefined;
  navigation: Pick<
    ReturnType<typeof useWorkbenchNavigation>,
    'openArtifact' | 'openDiff' | 'openWorkspaceFile' | 'openWorkspaceResource' | 'revealWorkbench'
  >;
  resources: ReturnType<typeof useWorkspaceResourceMap>;
  sessionId: string;
  workspaceId: string;
}) {
  const navigate = useNavigate();
  const repository = useRepository();
  const { openArtifact, openDiff, openWorkspaceFile, openWorkspaceResource, revealWorkbench } =
    navigation;
  return useCallback(
    async (reference: WorkspaceReference) => {
      await navigateComposerReferenceOrToast({
        artifacts,
        diffs: diffs ?? [],
        openArtifact,
        openDiff,
        openExternal: openExternalUrlOrToast,
        openSession: (targetWorkspaceId, targetSessionId) =>
          void navigate(
            `/workspaces/${encodeURIComponent(targetWorkspaceId)}/sessions/${encodeURIComponent(targetSessionId)}`,
          ),
        openWorkspaceFile,
        openWorkspaceResource,
        reference,
        repository,
        resources,
        revealSession: () => revealWorkbench({ kind: 'session' }),
        sessionId,
        workspaceId,
      });
    },
    [
      artifacts,
      diffs,
      navigate,
      openArtifact,
      openDiff,
      openWorkspaceFile,
      openWorkspaceResource,
      repository,
      resources,
      revealWorkbench,
      sessionId,
      workspaceId,
    ],
  );
}
