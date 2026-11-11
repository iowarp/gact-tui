import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * Whether the connected service moves conversations between workspaces
 * (`x_clio_session_move`). Without it the menus offer no Move to.
 */
export function useSessionMoveSupported(): boolean {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.capabilities(signal),
    // A service's capabilities hold for the connection; a menu opening need not ask again.
    staleTime: 5 * 60_000,
  });
  return capabilities.data?.capabilities.x_clio_session_move === true;
}

/** The workspaces a conversation can move to, from the shared workspaces list. */
export function useSessionMoveTargets(enabled: boolean) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint),
    queryFn: ({ signal }) => repository.workspaces(signal),
    enabled,
  });
}
