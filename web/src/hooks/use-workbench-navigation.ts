import type { Artifact, Session, SessionDiff, SubagentRun, WorkspaceResource } from '@clio/core/v3';
import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { SubagentOpenTarget } from '@/components/clio/subagent-card';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import { useConnectionSettings } from '@/providers/connection-provider';

interface UseWorkbenchNavigationInput {
  allSessions: readonly Session[];
  workspaceId: string;
}

interface WorkbenchRequest {
  endpoint: string;
  key: string;
  request: ClioWorkbenchOpenRequest;
}

/** Owns central-versus-canvas navigation for workspace resources and child sessions. */
export function useWorkbenchNavigation({ allSessions, workspaceId }: UseWorkbenchNavigationInput) {
  const navigate = useNavigate();
  const { settings } = useConnectionSettings();
  const [workbenchRequest, setWorkbenchRequest] = useState<WorkbenchRequest>();

  const revealWorkbench = useCallback(
    (request: ClioWorkbenchOpenRequest) => {
      setWorkbenchRequest({
        endpoint: settings.endpoint,
        key: `${request.kind}:${Date.now()}`,
        request,
      });
    },
    [settings.endpoint],
  );

  const openSubagent = useCallback(
    (subagent: SubagentRun, target: SubagentOpenTarget) => {
      if (!subagent.child_session_id) return;
      if (target === 'canvas') {
        revealWorkbench({ kind: 'subagent', subagent });
        return;
      }
      const child = allSessions.find((item) => item.id === subagent.child_session_id);
      void navigate(
        `/workspaces/${encodeURIComponent(child?.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(subagent.child_session_id)}`,
      );
    },
    [allSessions, navigate, revealWorkbench, workspaceId],
  );

  const openArtifact = useCallback(
    (artifact: Artifact) => revealWorkbench({ kind: 'artifact', artifact }),
    [revealWorkbench],
  );
  const openWorkspaceFile = useCallback(
    (path: string) => revealWorkbench({ kind: 'workspace-file', path }),
    [revealWorkbench],
  );
  const openWorkspaceResource = useCallback(
    (resource: WorkspaceResource, relatedResources?: readonly WorkspaceResource[]) =>
      revealWorkbench({ kind: 'resource', relatedResources, resource }),
    [revealWorkbench],
  );
  const openDiff = useCallback(
    (diff: SessionDiff) => revealWorkbench({ kind: 'diff', diff }),
    [revealWorkbench],
  );

  const activeRequest =
    workbenchRequest?.endpoint === settings.endpoint ? workbenchRequest : undefined;

  return {
    activeRequest,
    openArtifact,
    openDiff,
    openSubagent,
    openWorkspaceFile,
    openWorkspaceResource,
    revealWorkbench,
  };
}
