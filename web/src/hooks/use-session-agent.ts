import {
  agentPluginsSupported,
  type AgentDelta,
  type PluginChangeApply,
  type SessionAgent,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * Whether the connected service composes agents from plugins; `undefined`
 * until its capabilities are known. Every plugin and agent route depends on it.
 */
export function useAgentPluginsSupported(): boolean | undefined {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  if (!capabilities.data) return capabilities.isError ? false : undefined;
  return agentPluginsSupported(capabilities.data.capabilities);
}

/**
 * The session's pinned agent resolution, and the one way to change it: send
 * the session's whole delta. The server reruns resolution and pins the result,
 * so the view always shows what the next turn runs. `compact` compacts the
 * conversation, which joins a change held as a note to the prompt.
 */
export function useSessionAgent(sessionId: string | undefined) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const supported = useAgentPluginsSupported();
  const key = queryKeys.key('session-agent', settings.endpoint, sessionId ?? '');
  const agent = useQuery({
    queryKey: key,
    enabled: Boolean(sessionId) && supported === true,
    queryFn: ({ signal }) => repository.sessionAgent(sessionId!, signal),
  });
  const update = useMutation({
    mutationFn: (input: { delta?: AgentDelta; ref?: string; apply?: PluginChangeApply }) =>
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
  // A compaction settles a change held as a note: the prompt catches up with
  // the pinned resolution, so the agent's prompt basis is read again.
  const compact = useMutation({
    mutationFn: () => repository.compactSession(sessionId!),
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  return { supported, agent, update, compact };
}

/** Installed plugins and packs, shared by the + menu and Settings. */
export function usePluginCatalog(enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const supported = useAgentPluginsSupported();
  return useQuery({
    queryKey: queryKeys.key('plugins', settings.endpoint),
    enabled: enabled && supported === true,
    queryFn: ({ signal }) => repository.plugins(signal),
  });
}

/** Installed agents and the person's saved agents. */
export function useInstalledAgents(enabled = true) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const supported = useAgentPluginsSupported();
  return useQuery({
    queryKey: queryKeys.key('agents', settings.endpoint),
    enabled: enabled && supported === true,
    queryFn: ({ signal }) => repository.agents(signal),
  });
}
