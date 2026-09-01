import { queryKeys } from '@/lib/query-keys';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useConnectionSettings } from '@/providers/connection-provider';
import { sessionObservabilityQueryKey } from './use-session-observability';
import { useRepository } from './use-repository';

/** Server-authorized mutations for one session's reviewable file changes. */
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

  const apply = useMutation({
    mutationFn: async (target: { sessionId: string; workspaceId: string; path: string }) => {
      const result = await repository.applySessionDiffs(target.sessionId, [target.path]);
      const failure = result.write_errors?.[target.path];
      if (failure) throw new Error(`The service could not apply ${target.path}: ${failure}`);
      if (!result.applied.includes(target.path)) {
        throw new Error(`The service did not confirm that ${target.path} was applied.`);
      }
      return result;
    },
    onSuccess: async (_result, target) => refresh(target),
  });

  const reject = useMutation({
    mutationFn: async (target: { sessionId: string; workspaceId: string; path: string }) => {
      const result = await repository.rejectSessionDiffs(target.sessionId, [target.path]);
      if (!result.rejected.includes(target.path)) {
        throw new Error(`The service did not confirm that ${target.path} was rejected.`);
      }
      return result;
    },
    onSuccess: async (_result, target) => refresh(target),
  });

  return { apply, reject };
}
