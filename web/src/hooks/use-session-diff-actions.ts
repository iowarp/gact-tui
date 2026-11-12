import { queryKeys } from '@/lib/query-keys';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { useConnectionSettings } from '@/providers/connection-provider';
import { sessionObservabilityQueryKey } from './use-session-observability';
import { useRepository } from './use-repository';

/**
 * Server-authorized Undo for the file changes the agent made in one session.
 * `scope` is the conversation on screen, so its pending and failed state stays with it.
 */
export function useSessionDiffActions(scope = '') {
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

  const undoKey = queryKeys.sessionAction(settings.endpoint, scope, 'undo-diff');
  const undo = useMutation({
    mutationKey: undoKey,
    mutationFn: (target: { sessionId: string; workspaceId: string; changeId: string }) =>
      repository.revertSessionDiff(target.sessionId, target.changeId),
    onSuccess: async (_result, target) => refresh(target),
  });
  // Read the outcome from the mutation cache, not the observer: a conversation
  // switch resets the observer, and an Undo that finishes while another
  // conversation is open must still show its result on return.
  const undoRuns = useMutationState({
    filters: { mutationKey: undoKey, exact: true },
    select: (mutation) => mutation.state,
  });
  const lastUndo = undoRuns.at(-1);

  return {
    undo,
    undoPending: lastUndo?.status === 'pending',
    undoError: lastUndo?.status === 'error' ? lastUndo.error : null,
  };
}
