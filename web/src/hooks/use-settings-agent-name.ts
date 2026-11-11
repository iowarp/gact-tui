import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { useAgentPluginsSupported, useInstalledAgents } from '@/hooks/use-session-agent';
import { queryKeys } from '@/lib/query-keys';
import { agentScopeName } from '@/lib/settings-agent-name';
import { useConnectionSettings } from '@/providers/connection-provider';

const STORAGE_KEY = 'clio.settings-agent-name.v1';

/** The last name each endpoint resolved to, so a reload doesn't flash the fallback first. */
function storedNames(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function rememberName(endpoint: string, name: string) {
  const names = storedNames();
  if (names[endpoint] === name) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...names, [endpoint]: name }));
  } catch {
    // Storage can be full or blocked; the name still resolves, only later.
  }
}

/**
 * The name Settings gives its agent scope: the connection's label, else the
 * service's default agent and where it runs ("CLIO local", "CLIO on gpu-01").
 * While the agent and its defaults load, the endpoint's last resolved name
 * stands in, so the scope line doesn't flip from the fallback noun.
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
  const pending =
    supported === undefined || (supported && (defaults.isPending || agents.isPending));
  const name = agentScopeName({
    label: settings.label,
    endpoint: settings.endpoint,
    defaultAgentRef: defaults.data?.agent_ref || defaults.data?.default_agent_ref || undefined,
    agents: agents.data,
  });
  useEffect(() => {
    if (!pending) rememberName(settings.endpoint, name);
  }, [pending, settings.endpoint, name]);
  if (pending && !settings.label) return storedNames()[settings.endpoint] ?? name;
  return name;
}
