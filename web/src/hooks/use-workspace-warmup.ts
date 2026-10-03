import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** Keep the draft workspace ready while visible, with no session identity. */
export function useWorkspaceWarmup(workspaceId: string, enabled: boolean, blueprintId?: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('workspace-warmup', settings.endpoint, workspaceId, blueprintId ?? ''),
    queryFn: () => repository.warmWorkspace(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    // The operation coalesces on the server. Do not cancel/restart a request
    // across StrictMode mounts; re-entering a draft prepares it again.
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
}
