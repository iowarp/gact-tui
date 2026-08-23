import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';
import { sessionObservabilityQueryKey } from './use-session-observability';

export function sessionContextQueryKey(endpoint: string, sessionId: string) {
  return ['session-context', endpoint, sessionId] as const;
}

/** Live session context, its compartment policy, and server-owned compaction. */
export function useSessionContext(sessionId: string, scope: string, enabled = true) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const baseKey = sessionContextQueryKey(settings.endpoint, sessionId);
  const canLoad = Boolean(enabled && sessionId && scope);
  const state = useQuery({
    queryKey: [...baseKey, 'state', scope],
    queryFn: ({ signal }) => repository.contextState(sessionId, scope, signal),
    enabled: canLoad,
  });
  const policy = useQuery({
    queryKey: [...baseKey, 'policy'],
    queryFn: ({ signal }) => repository.contextPolicy(sessionId, signal),
    enabled: Boolean(enabled && sessionId),
  });
  const compact = useMutation({
    mutationFn: () => repository.compactContext(sessionId, scope),
    onSuccess: async (snapshot) => {
      queryClient.setQueryData([...baseKey, 'state', scope], snapshot);
      await queryClient.invalidateQueries({
        queryKey: sessionObservabilityQueryKey(settings.endpoint, sessionId),
      });
      toast.success('Working context compacted');
    },
    onError: (error) =>
      toast.error('Context could not be compacted', { description: error.message }),
  });
  return { compact, policy, state };
}
