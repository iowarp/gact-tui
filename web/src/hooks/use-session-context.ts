import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContextSnapshot } from '@clio/core/v3';
import { toast } from 'sonner';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { useRepository } from './use-repository';
import { sessionObservabilityQueryKey } from './use-session-observability';

export function sessionContextQueryKey(endpoint: string, sessionId: string) {
  return queryKeys.sessionContext(endpoint, sessionId);
}

/** Selected agent context plus server-owned compaction controls. */
export function useSessionContext(sessionId: string, scope: string, enabled = true) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const canLoad = Boolean(enabled && sessionId && scope);
  const state = useQuery({
    queryKey: queryKeys.sessionContextState(settings.endpoint, sessionId, scope),
    queryFn: ({ signal }) => repository.contextState(sessionId, scope, signal),
    enabled: canLoad,
  });
  const compact = useMutation({
    mutationFn: () => repository.compactContext(sessionId, scope),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData(
        queryKeys.sessionContextState(settings.endpoint, sessionId, scope),
        snapshot,
      );
      await queryClient.invalidateQueries({
        queryKey: sessionObservabilityQueryKey(settings.endpoint, sessionId),
      });
      toast.success('Working context compacted');
    },
    onError: (error) =>
      toast.error('Context could not be compacted', { description: error.message }),
  });
  const preferences = useMutation({
    mutationFn: (input: { automatic_compaction?: boolean; autocompact_pct?: number }) =>
      repository.updateContextPreferences(sessionId, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData<ContextSnapshot>(
        queryKeys.sessionContextState(settings.endpoint, sessionId, scope),
        (current) =>
          current
            ? {
                ...current,
                autocompact_enabled: updated.automatic_compaction,
                autocompact_pct: updated.autocompact_pct,
              }
            : current,
      );
      await queryClient.invalidateQueries({
        queryKey: queryKeys.sessionContextState(settings.endpoint, sessionId, scope),
      });
      toast.success('Context controls updated');
    },
    onError: (error) =>
      toast.error('Context controls could not be updated', { description: error.message }),
  });
  return { compact, preferences, state };
}
