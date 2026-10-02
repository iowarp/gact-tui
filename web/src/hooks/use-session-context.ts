import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContextSnapshot } from '@clio/core/v3';
import { toast } from 'sonner';
import { useConnectionSettings } from '@/providers/connection-provider';
import { queryKeys } from '@/lib/query-keys';
import { useLiveStore } from '@/store/live-store';
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
  // The conversation shows a running compaction in place ("Summarizing
  // context", then its summary or typed error), so the request itself only
  // reports what the stream cannot: a refusal or a failed request.
  const compact = useMutation({
    mutationFn: () => repository.compactSession(sessionId, scope),
    onSuccess: async (result) => {
      if (!result.compacted)
        toast.info('Context was not compacted', {
          description: result.reason ?? 'The service did not report a reason.',
        });
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.sessionContextState(settings.endpoint, sessionId, scope),
        }),
        queryClient.invalidateQueries({
          queryKey: sessionObservabilityQueryKey(settings.endpoint, sessionId),
        }),
      ]);
    },
    onError: (error) =>
      toast.error('Context could not be compacted', { description: error.message }),
  });
  const compactionRunning = useLiveStore((live) =>
    Object.values(live.entities.compactions).some(
      (compaction) => compaction.session_id === sessionId && compaction.status !== 'failed',
    ),
  );
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
  return {
    compact,
    /** A compaction request is in flight or one is running for this session. */
    compactPending: compact.isPending || compactionRunning,
    preferences,
    state,
  };
}
