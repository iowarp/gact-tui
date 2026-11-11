import type { Artifact, Session, SessionDiff, SubagentRun, WorkspaceResource } from '@clio/core/v3';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { connectionScope } from '@/lib/connection-scope';
import { KNOWLEDGE_OPEN_EVENT, type KnowledgeOpenRequest } from '@/lib/knowledge-navigation';
import { OPEN_VARIANT_TRY_EVENT, type OpenVariantTryDetail } from '@/lib/variant-try-tabs';
import { useNavigate, useLocation } from 'react-router-dom';
import type { SubagentOpenTarget } from '@/components/clio/subagent-card';
import type { ClioWorkbenchOpenRequest } from '@/components/clio/workbench';
import { useConnectionSettings } from '@/providers/connection-provider';
import { workspaceFilePath } from '@/lib/workspace-file-path';
import type { FileSearchLocation } from '@/lib/search-matches';
import { useLiveStore } from '@/store/live-store';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import {
  OPEN_BROWSER_PAGE_EVENT,
  OPEN_FILE_IN_BROWSER_EVENT,
  browserFileFailure,
  type DraftBrowserPageState,
  type OpenBrowserPageDetail,
  type OpenFileInBrowserDetail,
} from '@/lib/html-in-browser';
import {
  createWorkbenchRequestStore,
  type WorkbenchRequest,
  type WorkbenchRequestSource,
} from '@/lib/workbench-request-store';

interface UseWorkbenchNavigationInput {
  allSessions: readonly Session[];
  workspaceId: string;
}

/** Owns central-versus-canvas navigation for workspace resources and child sessions. */
export function useWorkbenchNavigation({ allSessions, workspaceId }: UseWorkbenchNavigationInput) {
  const navigate = useNavigate();
  const location = useLocation();
  const { settings } = useConnectionSettings();
  const scope = connectionScope(settings);
  const workspacePath = useLiveStore((state) => state.entities.workspaces[workspaceId]?.path);
  // Requests live outside React state so opening a tab does not re-render the
  // page (conversation, composer, navigation); only their readers update.
  const [requestStore] = useState(createWorkbenchRequestStore);
  // The session list refreshes on every streamed event. Read it when a
  // navigation runs so these callbacks keep their identity and the memoized
  // transcript rows they reach do not re-render.
  const allSessionsRef = useRef(allSessions);
  useLayoutEffect(() => {
    allSessionsRef.current = allSessions;
  }, [allSessions]);

  const revealWorkbench = useCallback(
    (request: ClioWorkbenchOpenRequest) => {
      requestStore.set({
        endpoint: settings.endpoint,
        key: `${request.kind}:${Date.now()}`,
        request,
      });
    },
    [requestStore, settings.endpoint],
  );
  const searchRequest = useMemo<WorkbenchRequest | undefined>(() => {
    const opened = location.state?.browserPage as DraftBrowserPageState | undefined;
    if (opened && opened.scope === scope && opened.pageId && opened.sessionId)
      return {
        endpoint: settings.endpoint,
        key: `browser-page:${location.key}`,
        request: {
          kind: 'browser',
          pageId: opened.pageId,
          sessionId: opened.sessionId,
          label: opened.label,
        },
      };
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
    if (request?.kind === 'search' && typeof request.query === 'string')
      return { endpoint: settings.endpoint, key: `global-search:${location.key}`, request };
  }, [location.key, location.state, scope, workspaceId, settings.endpoint]);

  const openSubagent = useCallback(
    (subagent: SubagentRun, target: SubagentOpenTarget) => {
      if (!subagent.child_session_id) return;
      if (target === 'canvas') {
        revealWorkbench({ kind: 'subagent', subagent });
        return;
      }
      const child = allSessionsRef.current.find((item) => item.id === subagent.child_session_id);
      void navigate(
        `/workspaces/${encodeURIComponent(child?.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(subagent.child_session_id)}`,
      );
    },
    [navigate, revealWorkbench, workspaceId],
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
      const owner = allSessionsRef.current.find((item) => item.id === ownerSessionId);
      if (owner) {
        void navigate(
          `/workspaces/${encodeURIComponent(owner.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(ownerSessionId)}`,
        );
        return true;
      }
      toast.error('The linked conversation is not available yet. Try again.');
      return false;
    },
    [navigate, openSubagent, workspaceId],
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

  useEffect(() => {
    const show = (event: Event) => {
      const { pageId, sessionId, label } = (event as CustomEvent<OpenBrowserPageDetail>).detail;
      revealWorkbench({ kind: 'browser', pageId, sessionId, label });
    };
    window.addEventListener(OPEN_BROWSER_PAGE_EVENT, show);
    return () => window.removeEventListener(OPEN_BROWSER_PAGE_EVENT, show);
  }, [revealWorkbench]);

  useEffect(() => {
    const show = (event: Event) => {
      const detail = (event as CustomEvent<OpenVariantTryDetail>).detail;
      revealWorkbench({ kind: 'variant-try', ...detail });
    };
    window.addEventListener(OPEN_VARIANT_TRY_EVENT, show);
    return () => window.removeEventListener(OPEN_VARIANT_TRY_EVENT, show);
  }, [revealWorkbench]);

  const repositoryForFiles = useRepository();
  useEffect(() => {
    const open = (event: Event) => {
      const { target, sessionId, label } = (event as CustomEvent<OpenFileInBrowserDetail>).detail;
      repositoryForFiles
        .openBrowserFile(sessionId, target)
        .then((page) =>
          revealWorkbench({
            kind: 'browser',
            pageId: page.id,
            sessionId,
            label: page.title || label,
          }),
        )
        .catch((error: unknown) => {
          toast.error(browserFileFailure(error instanceof Error ? error.message : '', label));
        });
    };
    window.addEventListener(OPEN_FILE_IN_BROWSER_EVENT, open);
    return () => window.removeEventListener(OPEN_FILE_IN_BROWSER_EVENT, open);
  }, [repositoryForFiles, revealWorkbench]);

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
  const openWorkspaceFolder = useCallback(
    (path: string) => revealWorkbench({ kind: 'workspace-folder', path }),
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
  const openFlow = useCallback(
    (handle: string, label?: string) => revealWorkbench({ kind: 'flow', handle, label }),
    [revealWorkbench],
  );

  const openParentSession = useCallback(
    (session: Session) => {
      if (!session.parent_session_id) return;
      const parent = allSessionsRef.current.find(
        (candidate) => candidate.id === session.parent_session_id,
      );
      navigate(
        `/workspaces/${encodeURIComponent(parent?.workspace_id ?? workspaceId)}/sessions/${encodeURIComponent(session.parent_session_id)}`,
      );
    },
    [navigate, workspaceId],
  );

  const requests = useMemo<WorkbenchRequestSource>(
    () => ({
      subscribe: requestStore.subscribe,
      get: () => {
        const explicit = requestStore.get();
        return explicit?.endpoint === settings.endpoint ? explicit : searchRequest;
      },
    }),
    [requestStore, searchRequest, settings.endpoint],
  );

  const repository = useRepository();
  const openWebPage = useCallback(
    (url: string, sessionId: string) => {
      repository
        .openBrowserPage(sessionId, url)
        .then((page) =>
          revealWorkbench({
            kind: 'browser',
            pageId: page.id,
            sessionId,
            label: page.title || page.host,
          }),
        )
        .catch((error: unknown) => {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Could not open the page in the shared browser.',
          );
        });
    },
    [repository, revealWorkbench],
  );

  const conversationNavigation = useMemo(
    () => ({
      onOpenWebPage: openWebPage,
      onOpenArtifact: openArtifact,
      onOpenFile: openWorkspaceFile,
      onOpenFileReference: openWorkspaceFile,
      onOpenFolder: openWorkspaceFolder,
      onOpenResource: openWorkspaceResource,
    }),
    [openArtifact, openWebPage, openWorkspaceFile, openWorkspaceFolder, openWorkspaceResource],
  );

  return {
    /** The open request to deliver; read it with `useWorkbenchRequest`. */
    requests,
    conversationNavigation,
    openArtifact,
    openDiff,
    openParentSession,
    openSubagent,
    openFlow,
    openWorkspaceFile,
    openWorkspaceFolder,
    openWorkspaceResource,
    revealWorkbench,
    revealSurfaceOwner,
  };
}
