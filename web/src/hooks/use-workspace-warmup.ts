import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { readRetryDelayMs, serviceStillStarting } from '@/lib/connection-attempt';
import { STARTING_READ_RETRIES } from '@/lib/runtime-limits';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/** Keep the draft workspace ready while visible, with no session identity. */
export function useWorkspaceWarmup(workspaceId: string, enabled: boolean, agentRef?: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('workspace-warmup', settings.endpoint, workspaceId, agentRef ?? ''),
    queryFn: () => repository.warmWorkspace(workspaceId),
    enabled: Boolean(workspaceId) && enabled,
    // The operation coalesces on the server. Do not cancel/restart a request
    // across StrictMode mounts; re-entering a draft prepares it again.
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    // An agent that is restarting (503 `task_runtime_starting`) is waited out with the
    // connect backoff instead of reporting that tools could not be prepared. Any other
    // failure is shown at once: preparing again only repeats the same work.
    retry: (failures, error) => serviceStillStarting(error) && failures < STARTING_READ_RETRIES,
    retryDelay: readRetryDelayMs,
  });
}
