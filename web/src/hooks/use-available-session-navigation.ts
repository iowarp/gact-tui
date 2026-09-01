import { queryKeys } from '@/lib/query-keys';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepository } from '@/hooks/use-repository';
import { connectionSessionRoute, latestConnectionSessionTarget } from '@/lib/connection-target';
import { rememberWorkspaceRoute } from '@/lib/workspace-route-memory';
import { useConnectionSettings } from '@/providers/connection-provider';

/** Resolve and open a valid primary session without passing through the connection landing. */
export function useAvailableSessionNavigation() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const repository = useRepository();
  const { settings } = useConnectionSettings();

  return useCallback(async () => {
    const [workspaces, sessions] = await Promise.all([
      repository.workspaces(),
      repository.allSessions(),
    ]);
    queryClient.setQueryData(queryKeys.key('workspaces', settings.endpoint), workspaces);
    queryClient.setQueryData(queryKeys.key('sessions', settings.endpoint, 'all'), sessions);

    const target = latestConnectionSessionTarget(workspaces, sessions);
    if (!target) {
      await navigate('/?intent=setup', { replace: true });
      return undefined;
    }

    queryClient.setQueryData(
      queryKeys.key('sessions', settings.endpoint, target.workspace.id),
      sessions.filter((session) => session.workspace_id === target.workspace.id),
    );
    rememberWorkspaceRoute(settings.endpoint, target.workspace.id, target.session.id);
    await navigate(connectionSessionRoute(target), { replace: true });
    return target;
  }, [navigate, queryClient, repository, settings.endpoint]);
}
