import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useKnownConnections, type KnownConnection } from '@/hooks/use-known-connections';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import type { CommandMenuScope } from '@/lib/command-menu-scopes';
import {
  globalSearchCommands,
  matchesGlobalSearch,
  type GlobalSearchCommand,
} from '@/lib/global-search-commands';

/** Agents and hosts shown per search. Unit: rows per group. */
const GLOBAL_SEARCH_GROUP_LIMIT = 20;

/**
 * The app-wide part of the palette: actions, navigation, settings, connections,
 * agents and hosts that match `query`. Call it only while the palette is open;
 * it reads saved connections and probes them.
 */
function isMissingEndpoint(error: unknown): boolean {
  return (error as { status?: number } | null | undefined)?.status === 404;
}

export function useGlobalSearchMatches(
  query: string,
  scope: CommandMenuScope,
  onFinish: () => void,
) {
  const repository = useRepository();
  const { settings, credentialsReady = true } = useConnectionSettings();
  const connections = useKnownConnections();
  const switchConnection = useSwitchConnection();
  const switching = useMutation({
    mutationFn: (connection: KnownConnection) => switchConnection(connection),
    onSuccess: onFinish,
  });
  const searching = Boolean(query.trim());
  const agents = useQuery({
    enabled: credentialsReady && searching,
    queryKey: queryKeys.key('agents', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.agents(signal),
  });
  const targets = useQuery({
    enabled: credentialsReady && searching,
    queryKey: ['infrastructure-targets', settings.endpoint, connectionScope(settings)],
    queryFn: ({ signal }) => repository.infrastructureTargets(signal),
  });
  const commands = useMemo(() => {
    const browsing: readonly GlobalSearchCommand['group'][] =
      scope === 'settings'
        ? ['Settings']
        : scope === 'more'
          ? ['Infrastructure']
          : scope === 'actions'
            ? ['Navigation', 'Actions']
            : ['Navigation'];
    const matched = globalSearchCommands(inTauri()).filter((item) =>
      searching
        ? matchesGlobalSearch(query, item.label, item.group, item.keywords)
        : browsing.includes(item.group),
    );
    return {
      Actions: matched.filter((item) => item.group === 'Actions'),
      Navigation: matched.filter((item) => item.group === 'Navigation'),
      Settings: matched.filter((item) => item.group === 'Settings'),
      Infrastructure: matched.filter((item) => item.group === 'Infrastructure'),
    };
  }, [query, scope, searching]);
  const matchedConnections = useMemo(
    () =>
      // Browsing, saved connections belong to More only: All starts on places.
      !searching && scope !== 'more'
        ? []
        : connections.filter((item) =>
            matchesGlobalSearch(
              query,
              'connections services',
              item.label,
              item.location,
              item.endpoint,
            ),
          ),
    [connections, query, scope, searching],
  );
  const matchedAgents = useMemo(
    () =>
      searching
        ? (agents.data ?? [])
            .filter((item) =>
              matchesGlobalSearch(
                query,
                'agents',
                item.ref,
                item.name,
                item.description,
                item.role,
              ),
            )
            .slice(0, GLOBAL_SEARCH_GROUP_LIMIT)
        : [],
    [agents.data, query, searching],
  );
  const matchedTargets = useMemo(
    () =>
      searching
        ? (targets.data ?? [])
            .filter((item) =>
              matchesGlobalSearch(
                query,
                'infrastructure hosts computers servers',
                item.id,
                item.label,
              ),
            )
            .slice(0, GLOBAL_SEARCH_GROUP_LIMIT)
        : [],
    [query, searching, targets.data],
  );
  return {
    commands,
    connections: matchedConnections,
    agents: matchedAgents,
    targets: matchedTargets,
    // A backend without the endpoint (404) has nothing to search: not an error.
    agentsError: searching && !isMissingEndpoint(agents.error) ? agents.error : null,
    targetsError: searching && !isMissingEndpoint(targets.error) ? targets.error : null,
    switching,
    counts: {
      actions: commands.Actions.length + commands.Navigation.length,
      settings: commands.Settings.length + matchedAgents.length,
      more: commands.Infrastructure.length + matchedConnections.length + matchedTargets.length,
    },
  };
}

export type GlobalSearchMatches = ReturnType<typeof useGlobalSearchMatches>;
