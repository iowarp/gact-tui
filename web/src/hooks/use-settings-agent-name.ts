import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, useInstalledAgents } from '@/hooks/use-session-agent';
import { queryKeys } from '@/lib/query-keys';
import { agentScopeName } from '@/lib/settings-agent-name';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * The name Settings gives its agent scope: the connection's label, else the
 * service's default agent and where it runs ("CLIO local", "CLIO on gpu-01").
 */
export function useSettingsAgentName(): string {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const supported = useAgentPluginsSupported();
  const defaults = useQuery({
    queryKey: queryKeys.key('session-defaults', settings.endpoint),
    queryFn: ({ signal }) => repository.sessionDefaults(signal),
    enabled: supported === true,
  });
  const agents = useInstalledAgents();
  return agentScopeName({
    label: settings.label,
    endpoint: settings.endpoint,
    defaultAgentRef: defaults.data?.agent_ref || defaults.data?.default_agent_ref || undefined,
    agents: agents.data,
  });
}
