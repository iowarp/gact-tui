import { useMutation, useQuery } from '@tanstack/react-query';
import { BotIcon, CableIcon, ServerIcon } from 'lucide-react';
import { CommandGroup, CommandItem, CommandShortcut } from '@/components/ui/command';
import { useKnownConnections, type KnownConnection } from '@/hooks/use-known-connections';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { inTauri } from '@/lib/transport/tauri-runtime';
import {
  agentSearchTarget,
  globalSearchCommands,
  matchesGlobalSearch,
} from '@/lib/global-search-commands';
import { SearchHighlight } from './search-highlight';
import { useTheme } from '@/providers/appearance-provider';

/** Global navigation and actions are mounted only while the normal palette is open. */
export function GlobalSearchResults({
  query,
  onRoute,
  onFinish,
}: {
  query: string;
  onRoute: (route: string) => void;
  onFinish: () => void;
}) {
  const repository = useRepository();
  const { settings, credentialsReady = true } = useConnectionSettings();
  const connections = useKnownConnections();
  const switchConnection = useSwitchConnection();
  const { setTheme, theme } = useTheme();
  const switching = useMutation({
    mutationFn: (connection: KnownConnection) => switchConnection(connection),
    onSuccess: onFinish,
  });
  const agents = useQuery({
    enabled: credentialsReady && Boolean(query.trim()),
    queryKey: queryKeys.key('agents', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.agents(signal),
  });
  const targets = useQuery({
    enabled: credentialsReady && Boolean(query.trim()),
    queryKey: ['infrastructure-targets', settings.endpoint, connectionScope(settings)],
    queryFn: ({ signal }) => repository.infrastructureTargets(signal),
  });
  const commands = globalSearchCommands(inTauri()).filter((item) =>
    !query.trim()
      ? item.group === 'Navigation' || item.group === 'Actions'
      : matchesGlobalSearch(query, item.label, item.group, item.keywords),
  );
  const matchedConnections = connections.filter((item) =>
    matchesGlobalSearch(query, 'connections services', item.label, item.location, item.endpoint),
  );
  const matchedAgents = query.trim()
    ? (agents.data ?? [])
        .filter((item) =>
          matchesGlobalSearch(query, 'agents', item.ref, item.name, item.description, item.role),
        )
        .slice(0, 20)
    : [];
  const matchedTargets = query.trim()
    ? (targets.data ?? [])
        .filter((item) =>
          matchesGlobalSearch(query, 'infrastructure hosts computers servers', item.id, item.label),
        )
        .slice(0, 20)
    : [];
  return (
    <>
      {(['Actions', 'Settings', 'Infrastructure', 'Navigation'] as const).map((group) => {
        const items = commands.filter((item) => item.group === group);
        return items.length ? (
          <CommandGroup key={group} heading={group}>
            {items.map((item) => (
              <CommandItem
                key={item.id}
                value={item.id}
                onSelect={() => {
                  if ('route' in item.action) onRoute(item.action.route);
                  else {
                    setTheme(item.action.theme);
                    onFinish();
                  }
                }}
              >
                <item.icon aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  <SearchHighlight text={item.label} query={query} />
                </span>
                {'theme' in item.action && theme === item.action.theme ? (
                  <CommandShortcut>Current</CommandShortcut>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null;
      })}
      {matchedConnections.length ? (
        <CommandGroup heading="Connections">
          {matchedConnections.map((item) => (
            <CommandItem
              key={item.endpoint}
              value={`connection:${item.endpoint}`}
              disabled={switching.isPending}
              onSelect={() =>
                item.endpoint === settings.endpoint ? onFinish() : switching.mutate(item)
              }
            >
              <CableIcon aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <SearchHighlight text={item.label || item.endpoint} query={query} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.location || item.endpoint}
                </span>
              </span>
              <CommandShortcut>
                {item.endpoint === settings.endpoint ? 'Current' : item.availability.label}
              </CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {switching.error ? (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          Connection could not be opened. {switching.error.message}
        </p>
      ) : null}
      {matchedAgents.length ? (
        <CommandGroup heading="Agents">
          {matchedAgents.map((item) => (
            <CommandItem
              key={item.ref}
              value={`agent:${item.ref}`}
              onSelect={() => onRoute(`/settings/agents#${agentSearchTarget(item.ref)}`)}
            >
              <BotIcon aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  <SearchHighlight text={item.name || item.id} query={query} />
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description || item.ref}
                </span>
              </span>
              <CommandShortcut>{item.kind === 'user' ? 'Your agent' : 'Agent'}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {matchedTargets.length ? (
        <CommandGroup heading="Hosts">
          {matchedTargets.map((item) => (
            <CommandItem
              key={item.id}
              value={`host:${item.id}`}
              onSelect={() =>
                onRoute(`/infrastructure/services?target=${encodeURIComponent(item.id)}`)
              }
            >
              <ServerIcon aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">
                <SearchHighlight text={item.label || item.id} query={query} />
              </span>
              <CommandShortcut>Infrastructure</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {query.trim() && agents.error ? (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          Agents could not be searched. {agents.error.message}
        </p>
      ) : null}
      {query.trim() && targets.error ? (
        <p role="alert" className="px-3 py-2 text-xs text-destructive">
          Hosts could not be searched. {targets.error.message}
        </p>
      ) : null}
    </>
  );
}
