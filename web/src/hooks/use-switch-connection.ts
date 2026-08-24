import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { createRepository, type SavedConnection } from '@/lib/connection';
import {
  connectionSessionRoute,
  connectionSessionTargetForRoute,
  latestConnectionSessionTarget,
} from '@/lib/connection-target';
import { recordById } from '@/lib/entities';
import { lastWorkspaceRoute, rememberWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';

interface SwitchConnectionOptions {
  navigateToWorkspace?: boolean;
}

/** Switch services only after resolving state that belongs to the destination connection. */
export function useSwitchConnection() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { connect } = useConnectionSettings();

  return useCallback(
    async (
      connection: SavedConnection,
      { navigateToWorkspace = true }: SwitchConnectionOptions = {},
    ) => {
      const repository = createRepository(connection);
      const [workspaces, sessions] = await Promise.all([
        repository.workspaces(),
        repository.allSessions(),
      ]);
      const target =
        connectionSessionTargetForRoute(
          lastWorkspaceRoute(connection.endpoint),
          workspaces,
          sessions,
        ) ?? latestConnectionSessionTarget(workspaces, sessions);

      queryClient.setQueryData(['workspaces', connection.endpoint], workspaces);
      queryClient.setQueryData(['sessions', connection.endpoint, 'all'], sessions);
      if (target) {
        queryClient.setQueryData(
          ['sessions', connection.endpoint, target.workspace.id],
          sessions.filter((session) => session.workspace_id === target.workspace.id),
        );
        rememberWorkspaceRoute(connection.endpoint, target.workspace.id, target.session.id);
      }

      const liveStore = useLiveStore.getState();
      liveStore.reset();
      liveStore.replaceSnapshots({
        sessions: recordById(sessions),
        workspaces: recordById(workspaces),
      });
      connect(connection);

      if (navigateToWorkspace) {
        await navigate(target ? connectionSessionRoute(target) : '/?intent=setup');
      }
      return target;
    },
    [connect, navigate, queryClient],
  );
}
