import type { AgentDelta, SessionAgent } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * The session's pinned agent resolution, and the one way to change it: send
 * the session's whole delta. The server reruns resolution and pins the result,
 * so the view always shows what the next turn runs.
 */
export function useSessionAgent(sessionId: string | undefined) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const key = queryKeys.key('session-agent', settings.endpoint, sessionId ?? '');
  const agent = useQuery({
    queryKey: key,
    enabled: Boolean(sessionId),
    queryFn: ({ signal }) => repository.sessionAgent(sessionId!, signal),
  });
  const update = useMutation({
    mutationFn: (input: { delta: AgentDelta; ref?: string }) =>
      repository.updateSessionAgent(sessionId!, input),
    onSuccess: async (next: SessionAgent) => {
      queryClient.setQueryData(key, next);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.key('sessions', settings.endpoint) }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.key('session-toolset', settings.endpoint),
        }),
      ]);
    },
  });
  return { agent, update };
}

/** Installed plugins and packs, shared by the + menu and Settings. */
export function usePluginCatalog(enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('plugins', settings.endpoint),
    enabled,
    queryFn: ({ signal }) => repository.plugins(signal),
  });
}

/** Installed agents and the person's saved agents. */
export function useInstalledAgents(enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('agents', settings.endpoint),
    enabled,
    queryFn: ({ signal }) => repository.agents(signal),
  });
}
