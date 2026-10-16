import type {
  Artifact,
  Session,
  SessionDiff,
  SubagentRun,
  ToolInvocation,
  WorkspaceResource,
} from '@clio/core/v3';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { connectionScope } from '@/lib/connection-scope';
import { KNOWLEDGE_OPEN_EVENT, type KnowledgeOpenRequest } from '@/lib/knowledge-navigation';
import { useNavigate, useLocation } from 'react-router-dom';
import type { SubagentOpenTarget } from '@/components/clio/subagent-card';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import { useConnectionSettings } from '@/providers/connection-provider';
import { workspaceFilePath } from '@/lib/workspace-file-path';
import type { FileSearchLocation } from '@/lib/search-matches';
import { useLiveStore } from '@/store/live-store';
import { toast } from 'sonner';

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
  const location = useLocation();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const workspacePath = useLiveStore((state) => state.entities.workspaces[workspaceId]?.path);
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
  const searchRequest = useMemo<WorkbenchRequest | undefined>(() => {
    const pending = location.state?.globalSearchResource;
    if (!pending || pending.scope !== scope) return;
    const request = pending.request as ClioWorkbenchOpenRequest | undefined;
    if (
      request?.kind === 'workspace-file' &&
      typeof request.path === 'string' &&
      (!request.workspaceId || request.workspaceId === workspaceId)
    )
      return { endpoint: settings.endpoint, key: `global-search:${location.key}`, request };
    if (request?.kind === 'artifact' && request.artifact?.workspace_id === workspaceId)
      return { endpoint: settings.endpoint, key: `global-search:${location.key}`, request };
  }, [location.key, location.state, scope, workspaceId, settings.endpoint]);

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

  const revealSurfaceOwner = useCallback(
    (ownerSessionId: string) => {
      const child = Object.values(useLiveStore.getState().entities.subagents).find(
        (item) => item.child_session_id === ownerSessionId,
      );
      if (child) {
        openSubagent(child, 'canvas');
        return true;
      }
      const owner = allSessions.find((item) => item.id === ownerSessionId);
      if (owner) {
        void navigate(
          `/workspaces/${encodeURIComponent(owner.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(ownerSessionId)}`,
        );
        return true;
      }
      toast.error('The linked conversation is not available yet. Try again.');
      return false;
    },
    [allSessions, navigate, openSubagent, workspaceId],
  );

  useEffect(() => {
    const open = (event: Event) => {
      const request = (event as CustomEvent<KnowledgeOpenRequest>).detail;
      if (request.workspaceId === workspaceId && request.scope === connectionScope(settings)) {
        revealWorkbench({ kind: 'knowledge', sourceId: request.sourceId, label: request.label });
      }
    };
    window.addEventListener(KNOWLEDGE_OPEN_EVENT, open);
    return () => window.removeEventListener(KNOWLEDGE_OPEN_EVENT, open);
  }, [workspaceId, settings, revealWorkbench]);

  const openArtifact = useCallback(
    (artifact: Artifact) => revealWorkbench({ kind: 'artifact', artifact }),
    [revealWorkbench],
  );
  const openWorkspaceFile = useCallback(
    (path: string, location: FileSearchLocation = {}) =>
      revealWorkbench({
        kind: 'workspace-file',
        ...location,
        path: workspaceFilePath(
          path,
          location.workspaceId && location.workspaceId !== workspaceId
            ? useLiveStore.getState().entities.workspaces[location.workspaceId]?.path
            : workspacePath,
        ),
      }),
    [revealWorkbench, workspacePath, workspaceId],
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
  const openWorkflow = useCallback(
    (tool: ToolInvocation) => revealWorkbench({ kind: 'workflow', tool }),
    [revealWorkbench],
  );

  const openParentSession = useCallback(
    (session: Session) => {
      if (!session.parent_session_id) return;
      const parent = allSessions.find((candidate) => candidate.id === session.parent_session_id);
      navigate(
        `/workspaces/${encodeURIComponent(parent?.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(session.parent_session_id)}`,
      );
    },
    [allSessions, navigate, workspaceId],
  );

  const activeRequest =
    workbenchRequest?.endpoint === settings.endpoint ? workbenchRequest : searchRequest;

  return {
    activeRequest,
    openArtifact,
    openDiff,
    openParentSession,
    openSubagent,
    openWorkflow,
    openWorkspaceFile,
    openWorkspaceResource,
    revealWorkbench,
    revealSurfaceOwner,
  };
}
