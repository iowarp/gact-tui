import type { McpServerDefinition } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { useRemoveSavedMcp, useSavedMcpServices } from '@/hooks/use-saved-mcp-services';
import { anyServerPreparing } from '@/lib/mcp-preparation';
import { mcpServiceEntries } from '@/lib/mcp-service-entries';
import { serviceKind } from '@/lib/mcp-service-presentation';
import { queryKeys } from '@/lib/query-keys';
import { MCP_PREPARING_POLL_MS } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ExtensionAddDialog } from './extension-add-dialog';
import { McpSignInDialog } from './mcp-sign-in';
import { StateView } from './primitives/state-view';
import { McpServiceList } from './settings-mcp-services';
import { SettingsGroupLabel } from './settings-row';

const GROUP = 'Remote MCP servers';

/**
 * The Remote tools segment of Tools and MCP servers: the MCP servers reached by
 * URL, whose tools run on another machine. Relay placements from earlier
 * versions are not converted; each remote server is added again by its URL.
 */
export function RelaySettings() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const saved = useSavedMcpServices();
  const [adding, setAdding] = useState(false);
  const [signingIn, setSigningIn] = useState('');

  const servers = useQuery({
    queryKey: queryKeys.key('mcp-servers', settings.endpoint, 'global', undefined),
    queryFn: ({ signal }) => repository.mcpServers(undefined, signal),
    refetchInterval: (query) =>
      anyServerPreparing(query.state.data) ? MCP_PREPARING_POLL_MS : false,
  });
  const entries = useMemo(
    () =>
      mcpServiceEntries(servers.data ?? [], saved.data ?? [], []).filter(
        (entry) => serviceKind(entry) === 'remote',
      ),
    [servers.data, saved.data],
  );

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.key('mcp-servers', settings.endpoint) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('tools', settings.endpoint) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('mcp-configurations', settings.endpoint),
      }),
    ]);
  const reconnect = useMutation({
    mutationFn: (server: McpServerDefinition) => repository.reconnectMcpServer(server.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Remote server reconnected');
    },
    onError: (error) => toast.error(error.message),
  });
  const disconnect = useMutation({
    mutationFn: (server: McpServerDefinition) => repository.deleteMcpServer(server.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Remote server disconnected');
    },
    onError: (error) => toast.error(error.message),
  });
  const removeSaved = useRemoveSavedMcp();

  let list;
  if (servers.isPending || saved.isPending)
    list = <StateView className="min-h-40" kind="loading" title="Loading remote servers" />;
  else if (servers.error)
    list = (
      <StateView
        action={{ label: 'Retry', onClick: () => void servers.refetch() }}
        className="min-h-48"
        detail={servers.error.message}
        kind="error"
        title="Remote servers could not be listed"
      />
    );
  else if (!entries.length)
    list = (
      <StateView
        action={{ label: 'Add by URL', onClick: () => setAdding(true) }}
        className="min-h-48"
        detail="Add an MCP server by URL to run its tools there."
        kind="empty"
        title="No remote tools yet"
      />
    );
  else
    list = (
      <McpServiceList
        entries={entries}
        label={GROUP}
        onDisconnect={(server) => disconnect.mutateAsync(server)}
        onReconnect={(server) => reconnect.mutate(server)}
        onRemoveSaved={(service) => removeSaved.mutateAsync(service)}
        reconnecting={reconnect.isPending ? reconnect.variables?.id : undefined}
      />
    );

  return (
    <section aria-label={GROUP} className="grid min-w-0">
      <SettingsGroupLabel
        addLabel="Add a remote MCP server by URL"
        className="mt-0 mb-1"
        onAdd={() => setAdding(true)}
      >
        {GROUP}
      </SettingsGroupLabel>
      {list}
      <p className="mt-3 text-xs text-faint">
        Relay placements from earlier versions are not converted. Add each remote server again by
        its URL.
      </p>

      {signingIn ? (
        <McpSignInDialog
          name={signingIn}
          onClose={() => setSigningIn('')}
          onConnected={() => void invalidate()}
        />
      ) : null}
      {adding ? (
        <ExtensionAddDialog
          choice={{ kind: 'remote' }}
          connections={saved.data ?? []}
          onClose={() => setAdding(false)}
          onSaved={invalidate}
          onSignIn={setSigningIn}
        />
      ) : null}
    </section>
  );
}
