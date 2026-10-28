import type { McpServerDefinition, ToolCatalogItem } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useRepository } from '@/hooks/use-repository';
import { mcpServiceEntries } from '@/lib/mcp-service-entries';
import { serviceTitle } from '@/lib/mcp-service-presentation';
import { reconnectableNamespace } from '@/lib/mcp-preparation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { McpServiceList } from './settings-mcp-services';

/**
 * The MCP servers this conversation's agent brings, each with its state: preparing
 * (and what it is doing), ready, or failed with the reason in plain words. A server
 * can be prepared again with Reconnect.
 */
export function ConversationMcpServers({
  sessionId,
  servers,
  tools,
}: {
  sessionId: string;
  servers: readonly McpServerDefinition[];
  tools: readonly ToolCatalogItem[];
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const own = useMemo(
    () => servers.filter((server) => server.session_id === sessionId),
    [servers, sessionId],
  );
  const entries = useMemo(() => mcpServiceEntries(own, [], tools), [own, tools]);
  const reconnect = useMutation({
    mutationFn: (server: McpServerDefinition) =>
      repository.reconnectSessionMcpServer(sessionId, reconnectableNamespace(server)),
    onSuccess: async (_answer, server) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.key('mcp-servers', settings.endpoint),
      });
      toast.success(`Preparing ${serviceTitle(server)} again`);
    },
    onError: (error, server) =>
      toast.error(`${serviceTitle(server)} could not be reconnected`, {
        description: error.message,
      }),
  });
  if (!entries.length) return null;
  return (
    <section aria-labelledby="conversation-mcp-servers-heading" className="mb-6 grid gap-2">
      <div>
        <h2 className="text-sm font-semibold" id="conversation-mcp-servers-heading">
          MCP servers in this conversation
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The servers this conversation&apos;s agent brings. Each is prepared when the conversation
          opens; its tools join once it is ready.
        </p>
      </div>
      <McpServiceList
        defaultOpen={false}
        entries={entries}
        onDisconnect={() => undefined}
        onReconnect={() => undefined}
        onReconnectSession={(server) => reconnect.mutate(server)}
        onRemoveSaved={() => undefined}
        reconnecting={reconnect.isPending ? reconnect.variables?.id : undefined}
        showConnection={false}
      />
    </section>
  );
}
