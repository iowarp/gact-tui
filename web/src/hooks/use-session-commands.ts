import { queryKeys } from '@/lib/query-keys';
import { invalidateQueriesInBackground } from '@/lib/query-invalidation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { sessionObservabilityQueryKey } from './use-session-observability';

/**
 * Service command discovery and authoritative execution. Without a session
 * (a new-conversation draft) the list is the workspace's; running one needs a session.
 */
export function useSessionCommands(sessionId: string, workspaceId: string) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const commands = useQuery({
    queryKey: queryKeys.key('commands', settings.endpoint, workspaceId, sessionId),
    queryFn: ({ signal }) => repository.commands(signal, { sessionId, workspaceId }),
    enabled: Boolean(workspaceId),
  });
  const execute = useMutation({
    mutationKey: queryKeys.sessionAction(settings.endpoint, sessionId, 'command'),
    mutationFn: ({ commandId, input }: { commandId: string; input: string }) =>
      repository.dispatchCommand(sessionId, commandId, input),
    onSuccess: () => {
      invalidateQueriesInBackground(queryClient, [
        queryKeys.key('transcript', settings.endpoint, sessionId),
        sessionObservabilityQueryKey(settings.endpoint, sessionId),
      ]);
    },
  });
  return {
    commands: commands.data ?? [],
    /** Whether `commands` is the agent's list yet, so an empty one can say why. */
    commandsState: commands.isError
      ? ('failed' as const)
      : commands.isPending
        ? ('loading' as const)
        : ('ready' as const),
    isPending: execute.isPending,
    run: async (value: { commandId: string; input: string }): Promise<void> => {
      await execute.mutateAsync(value);
    },
  };
}
