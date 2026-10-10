import { queryKeys } from '@/lib/query-keys';
import { loadSessionReviewRenderer } from '@/lib/session-export/renderer-assets';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResourceActions } from '@/components/clio/resource-dialogs';
import { useAvailableSessionNavigation } from '@/hooks/use-available-session-navigation';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { closeEmbeddedTerminalsForSession } from '@/tauri/workspace-terminal';
import { useLiveStore } from '@/store/live-store';

/**
 * The workspace/session CRUD surface for navigation-owning components (command
 * menu, sidebar): create, rename, pin, archive, delete, export/import, plus
 * the query-invalidation refresh every mutation needs afterward.
 */
export function useWorkspaceNavigationActions(workspaceId: string, sessionId: string) {
  const navigate = useNavigate();
  const navigateToAvailableSession = useAvailableSessionNavigation();
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();

  const refreshNavigation = useCallback(
    async (targetWorkspaceId = workspaceId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.key('workspaces', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, 'all'),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('sessions', settings.endpoint, targetWorkspaceId),
        }),
      ]);
    },
    [queryClient, settings.endpoint, workspaceId],
  );

  const updateSessionIdentity = useCallback(
    async (id: string, patch: { title?: string; pinned?: boolean }) => {
      const updated = await repository.updateSession(id, patch);
      // A live session owns its streamed row, so a list refetch alone cannot
      // update its name/pin. Apply only acknowledged identity fields; retain
      // any newer work state and other fields delivered while the request ran.
      useLiveStore.setState((state) => {
        const current = state.entities.sessions[id];
        if (!current) return state;
        return {
          entities: {
            ...state.entities,
            sessions: {
              ...state.entities.sessions,
              [id]: {
                ...current,
                ...(patch.title !== undefined ? { title: updated.title } : {}),
                ...(patch.pinned !== undefined ? { pinned: updated.pinned } : {}),
              },
            },
          },
        };
      });
    },
    [repository],
  );

  const navigationActions = useMemo<ResourceActions>(
    () => ({
      createWorkspace: async ({ name, rootPath }) => {
        await repository.createWorkspace({ name, root_path: rootPath });
        await refreshNavigation();
      },
      createSession: async ({
        title,
        workspaceId: targetWorkspaceId,
        blueprintId,
        mode,
        routingMode,
        approvalMode,
      }) => {
        const created = await repository.createSession({
          workspace_id: targetWorkspaceId,
          title,
          mode,
          routing_mode: routingMode,
          approval_mode: approvalMode,
          blueprint_id: blueprintId,
        });
        await refreshNavigation(targetWorkspaceId);
        await navigate(
          `/workspaces/${encodeURIComponent(targetWorkspaceId)}/sessions/${encodeURIComponent(created.id)}`,
        );
      },
      renameWorkspace: async (targetWorkspaceId, name) => {
        await repository.updateWorkspace(targetWorkspaceId, { name });
        await refreshNavigation(targetWorkspaceId);
      },
      grantWorkspaceFolder: async (targetWorkspaceId, path) => {
        await repository.grantWorkspaceFolder(targetWorkspaceId, path);
        await refreshNavigation(targetWorkspaceId);
      },
      revokeWorkspaceFolder: async (targetWorkspaceId, path) => {
        await repository.revokeWorkspaceFolder(targetWorkspaceId, path);
        await refreshNavigation(targetWorkspaceId);
      },
      renameSession: async (targetSessionId, title) => {
        await updateSessionIdentity(targetSessionId, { title });
        await refreshNavigation();
      },
      setWorkspacePinned: async (targetWorkspaceId, pinned) => {
        await repository.updateWorkspace(targetWorkspaceId, { pinned });
        await refreshNavigation(targetWorkspaceId);
      },
      setSessionPinned: async (targetSessionId, pinned) => {
        await updateSessionIdentity(targetSessionId, { pinned });
        await refreshNavigation();
      },
      archiveSession: async (targetSessionId) => {
        await repository.updateSession(targetSessionId, { archived: true });
        if (targetSessionId === sessionId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation();
      },
      restoreSession: async (targetSessionId) => {
        await repository.updateSession(targetSessionId, { archived: false });
        await refreshNavigation();
      },
      deleteWorkspace: async (targetWorkspaceId) => {
        await repository.deleteWorkspace(targetWorkspaceId);
        if (targetWorkspaceId === workspaceId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation(targetWorkspaceId);
      },
      deleteSession: async (targetSessionId) => {
        // Best-effort: an embedded terminal opened under this session must
        // not outlive it, even if its workbench tab was never explicitly
        // closed. Never blocks the actual delete on pty teardown.
        await closeEmbeddedTerminalsForSession(targetSessionId).catch(() => undefined);
        await repository.deleteSession(targetSessionId);
        if (targetSessionId === sessionId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation();
      },
      exportSession: async (targetSessionId, mode) =>
        repository.prepareSessionArchive(targetSessionId, mode, await loadSessionReviewRenderer()),
      importSession: async (value) => {
        const imported = await repository.importSession(value);
        await refreshNavigation(imported.workspace_id);
        await navigate(
          `/workspaces/${encodeURIComponent(imported.workspace_id)}/sessions/${encodeURIComponent(imported.id)}`,
        );
      },
    }),
    [
      navigate,
      navigateToAvailableSession,
      refreshNavigation,
      repository,
      sessionId,
      workspaceId,
      updateSessionIdentity,
    ],
  );

  return { navigationActions, refreshNavigation };
}
