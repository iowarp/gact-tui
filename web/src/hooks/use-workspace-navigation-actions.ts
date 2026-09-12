import { queryKeys } from '@/lib/query-keys';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ResourceActions } from '@/components/clio/resource-dialogs';
import { useAvailableSessionNavigation } from '@/hooks/use-available-session-navigation';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

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
        });
        if (blueprintId) await repository.setSessionAgentBlueprint(created.id, blueprintId);
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
        await repository.updateSession(targetSessionId, { title });
        await refreshNavigation();
      },
      setWorkspacePinned: async (targetWorkspaceId, pinned) => {
        await repository.updateWorkspace(targetWorkspaceId, { pinned });
        await refreshNavigation(targetWorkspaceId);
      },
      setSessionPinned: async (targetSessionId, pinned) => {
        await repository.updateSession(targetSessionId, { pinned });
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
        await repository.deleteSession(targetSessionId);
        if (targetSessionId === sessionId) {
          await navigateToAvailableSession();
          return;
        }
        await refreshNavigation();
      },
      exportSession: (targetSessionId) => repository.exportSession(targetSessionId),
      importSession: async (value) => {
        const imported = await repository.importSession(value);
        await refreshNavigation(imported.workspace_id);
        await navigate(
          `/workspaces/${encodeURIComponent(imported.workspace_id)}/sessions/${encodeURIComponent(imported.id)}`,
        );
      },
    }),
    [navigate, navigateToAvailableSession, refreshNavigation, repository, sessionId, workspaceId],
  );

  return { navigationActions, refreshNavigation };
}
