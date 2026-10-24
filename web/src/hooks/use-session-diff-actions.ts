import { queryKeys } from '@/lib/query-keys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConnectionSettings } from '@/providers/connection-provider';
import { sessionObservabilityQueryKey } from './use-session-observability';
import { useRepository } from './use-repository';

/** Server-authorized Undo for the file changes the agent made in one session. */
export function useSessionDiffActions() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();

  const refresh = async (target: { sessionId: string; workspaceId: string }) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.key(
          ...sessionObservabilityQueryKey(settings.endpoint, target.sessionId),
          'diffs',
        ),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('workspace-files', settings.endpoint, target.workspaceId),
      }),
    ]);
  };

  const undo = useMutation({
    mutationFn: (target: { sessionId: string; workspaceId: string; changeId: string }) =>
      repository.revertSessionDiff(target.sessionId, target.changeId),
    onSuccess: async (_result, target) => refresh(target),
  });

  return { undo };
}
