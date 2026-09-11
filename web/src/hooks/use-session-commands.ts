import { queryKeys } from '@/lib/query-keys';
import { invalidateQueriesInBackground } from '@/lib/query-invalidation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { sessionObservabilityQueryKey } from './use-session-observability';

/** Session-scoped service command discovery and authoritative execution. */
export function useSessionCommands(sessionId: string, workspaceId: string) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const commands = useQuery({
    queryKey: queryKeys.key('commands', settings.endpoint, workspaceId, sessionId),
    queryFn: ({ signal }) => repository.commands(signal, { sessionId, workspaceId }),
    enabled: Boolean(sessionId && workspaceId),
  });
  const execute = useMutation({
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
    isPending: execute.isPending,
    run: async (value: { commandId: string; input: string }): Promise<void> => {
      await execute.mutateAsync(value);
    },
  };
}
