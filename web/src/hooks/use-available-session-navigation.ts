import { queryKeys } from '@/lib/query-keys';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRepository } from '@/hooks/use-repository';
import {
  connectionCandidateSessions,
  connectionSessionRoute,
  latestConnectionSessionTarget,
} from '@/lib/connection-target';
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
      connectionCandidateSessions(repository, ''),
    ]);
    queryClient.setQueryData(queryKeys.key('workspaces', settings.endpoint), workspaces);

    const target = latestConnectionSessionTarget(workspaces, sessions);
    if (!target) {
      await navigate('/?intent=setup', { replace: true });
      return undefined;
    }

    rememberWorkspaceRoute(settings.endpoint, target.workspace.id, target.session.id);
    await navigate(connectionSessionRoute(target), { replace: true });
    return target;
  }, [navigate, queryClient, repository, settings.endpoint]);
}
