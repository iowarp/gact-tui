import { queryKeys } from '@/lib/query-keys';
import { ExtensionAddDialog, ExtensionAddMenu, type ExtensionAdd } from './extension-add-dialog';

import { RemoveSavedMcpDialog } from './settings-saved-mcp';
import { McpServiceList } from './settings-mcp-services';
import { McpConnectionDetails } from './mcp-connection-details';
import { useSavedMcpServices } from '@/hooks/use-saved-mcp-services';
import { mcpServiceEntries } from '@/lib/mcp-service-entries';
import type { McpServerDefinition, SavedMcpService, Workspace } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpenIcon, ScrollTextIcon, WrenchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';
import { humanizeToolName } from './tool-presentation';
import { McpSignInDialog } from './mcp-sign-in';
import { InventoryList } from './mcp-inventory';

function workspaceTitle(workspace: Workspace) {
  return workspace.display_name || workspace.name;
}

function serverTitle(server: McpServerDefinition) {
  if (server.transport === 'in_process') {
    if (server.name === 'fs') return 'Workspace files';
    if (server.name === 'shell') return 'Local commands';
    return humanizeToolName(server.name || server.id);
  }
  return server.name || humanizeToolName(server.id);
}

function connectionLabel(server: McpServerDefinition) {
  if (server.transport === 'in_process') return 'Built in';
  if (server.source === 'plugin')
    return server.plugin ? `From plugin ${server.plugin}` : 'From a plugin';
  if (server.transport === 'stdio') return 'Local command';
  if (server.transport === 'http' || server.transport === 'streamable-http') {
    return 'Remote service';
  }
  return server.transport ? humanizeToolName(server.transport) : 'Connection unavailable';
}

export function ToolsSettings({
  initialWorkspaceId,
  embedded = false,
  computerLabel,
}: {
  initialWorkspaceId?: string;
  embedded?: boolean;
  computerLabel?: string;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [workspacePreference, setWorkspacePreference] = useState('');
  const [adding, setAdding] = useState<ExtensionAdd>();
  const [detailServer, setDetailServer] = useState<McpServerDefinition>();
  const [deleteServer, setDeleteServer] = useState<McpServerDefinition>();
  const [removingSaved, setRemovingSaved] = useState<SavedMcpService>();
  const [signingIn, setSigningIn] = useState('');
  const saved = useSavedMcpServices();

  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint, 'tool-settings'),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const requestedWorkspaceId = workspacePreference || initialWorkspaceId;
  const workspaceId =
    workspaces.data?.find((workspace) => workspace.id === requestedWorkspaceId)?.id ||
    workspaces.data?.[0]?.id ||
    '';
  const servers = useQuery({
    queryKey: queryKeys.key('mcp-servers', settings.endpoint, workspaceId || 'global'),
    queryFn: ({ signal }) => repository.mcpServers(workspaceId || undefined, signal),
  });
  const tools = useQuery({
    queryKey: queryKeys.key('tools', settings.endpoint),
    queryFn: ({ signal }) => repository.tools(signal),
  });
  // Declared namespaces are not installed-server API identities. Inspect their
  // recorded configuration without starting a conversation or probing a false ID.
  const liveDetail = Boolean(detailServer && !/^(?:draft|session)_mcp_/u.test(detailServer.id));
  const detail = useQuery({
    enabled: liveDetail,
    queryKey: queryKeys.key('mcp-server', settings.endpoint, detailServer?.id),
    queryFn: ({ signal }) => repository.mcpServer(detailServer?.id ?? '', signal),
  });
  const toolInventory = useQuery({
    enabled: liveDetail,
    queryKey: queryKeys.key('mcp-server-inventory', settings.endpoint, detailServer?.id, 'tools'),
    queryFn: ({ signal }) => repository.mcpServerInventory(detailServer?.id ?? '', 'tools', signal),
  });
  const resourceInventory = useQuery({
    enabled: liveDetail,
    queryKey: queryKeys.key(
      'mcp-server-inventory',
      settings.endpoint,
      detailServer?.id,
      'resources',
    ),
    queryFn: ({ signal }) =>
      repository.mcpServerInventory(detailServer?.id ?? '', 'resources', signal),
  });
  const promptInventory = useQuery({
    enabled: liveDetail,
    queryKey: queryKeys.key('mcp-server-inventory', settings.endpoint, detailServer?.id, 'prompts'),
    queryFn: ({ signal }) =>
      repository.mcpServerInventory(detailServer?.id ?? '', 'prompts', signal),
  });
  const serverTools = useMemo(() => {
    if (!detailServer) return [];
    return (tools.data ?? []).filter(
      (tool) => tool.server_id === detailServer.id || tool.source === detailServer.id,
    );
  }, [detailServer, tools.data]);

  const entries = useMemo(
    () => mcpServiceEntries(servers.data ?? [], saved.data ?? [], tools.data ?? []),
    [servers.data, saved.data, tools.data],
  );

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.key('mcp-servers', settings.endpoint) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('tools', settings.endpoint) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.key('agents', settings.endpoint) }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('mcp-configurations', settings.endpoint),
      }),
    ]);
  };
  const reconnect = useMutation({
    mutationFn: (server: McpServerDefinition) => repository.reconnectMcpServer(server.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('Tool provider reconnected');
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (server: McpServerDefinition) => repository.deleteMcpServer(server.id),
    onSuccess: async () => {
      setDeleteServer(undefined);
      await invalidate();
      toast.success('Tool provider disconnected');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="grid gap-6">
      {!embedded ? (
        <SettingsSectionHeading
          description="MCP services give agents tools, data, and reusable prompts. Built-in services ship with the agent; external services are connections you can manage."
          title="MCP tools"
        />
      ) : null}
      <section aria-labelledby="mcp-services-heading" className="grid gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" id="mcp-services-heading">
              {embedded
                ? `MCP services · ${computerLabel || settings.location || 'Connected computer'}`
                : 'Services and their tools'}
            </h2>
            {!embedded ? (
              <p className="mt-1 text-sm text-muted-foreground">
                What a new conversation in this workspace gets: the built-in services, the services
                its agent&apos;s plugins bring, and yours.
              </p>
            ) : null}
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end md:w-auto">
            {!embedded && workspaces.data?.length ? (
              <Field className="w-full sm:w-56">
                <FieldLabel htmlFor="tools-workspace">Workspace</FieldLabel>
                <Select onValueChange={setWorkspacePreference} value={workspaceId}>
                  <SelectTrigger id="tools-workspace">
                    <SelectValue placeholder="Choose a workspace" />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.data.map((workspace) => (
                      <SelectItem key={workspace.id} value={workspace.id}>
                        {workspaceTitle(workspace)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            <ExtensionAddMenu mcpOnly onChoose={setAdding} />
          </div>
        </div>
        {servers.isPending || tools.isPending ? <ToolCatalogLoading /> : null}
        {servers.error ? (
          <Alert variant="destructive">
            <AlertTitle>MCP services unavailable</AlertTitle>
            <AlertDescription>{servers.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {tools.error ? (
          <Alert variant="destructive">
            <AlertTitle>Tool descriptions could not be loaded</AlertTitle>
            <AlertDescription>{tools.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {servers.data ? (
          entries.length ? (
            <McpServiceList
              entries={entries}
              onDetails={setDetailServer}
              onDisconnect={setDeleteServer}
              onReconnect={(server) => reconnect.mutate(server)}
              onRemoveSaved={setRemovingSaved}
              reconnecting={reconnect.isPending ? reconnect.variables?.id : undefined}
              defaultOpen={!embedded}
              showConnection={!embedded}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No MCP services were reported.</p>
          )
        ) : null}
      </section>

      <RemoveSavedMcpDialog onClose={() => setRemovingSaved(undefined)} service={removingSaved} />
      {signingIn ? (
        <McpSignInDialog
          name={signingIn}
          onClose={() => setSigningIn('')}
          onConnected={() => {
            void invalidate();
          }}
        />
      ) : null}

      {adding ? (
        <ExtensionAddDialog
          choice={adding}
          connections={saved.data ?? []}
          onClose={() => setAdding(undefined)}
          onSaved={invalidate}
          onSignIn={setSigningIn}
        />
      ) : null}

      <Dialog
        onOpenChange={(open) => !open && setDetailServer(undefined)}
        open={Boolean(detailServer)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detailServer ? serverTitle(detailServer) : 'MCP service'}</DialogTitle>
            <DialogDescription>
              Connection and contents reported by this MCP service.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <ClioStatus
              label={
                liveDetail && detail.isPending
                  ? 'Loading provider'
                  : (detail.data || detailServer)?.status === 'ready'
                    ? 'Ready'
                    : (detail.data || detailServer)?.status === 'available'
                      ? 'Starts when used'
                      : humanizeToolName((detail.data || detailServer)?.status ?? 'unavailable')
              }
              value={
                liveDetail && detail.isPending
                  ? 'connecting'
                  : (detail.data || detailServer)?.status === 'ready'
                    ? 'healthy'
                    : (detail.data || detailServer)?.status === 'available'
                      ? 'pending'
                      : 'degraded'
              }
            />
            <Badge variant="outline">{detailServer ? connectionLabel(detailServer) : ''}</Badge>
            {(detail.data || detailServer)?.status === 'ready' ||
            (detail.data || detailServer)?.tools_count ? (
              <Badge variant="outline">
                {(detail.data || detailServer)?.tools_count ?? 0} tools
              </Badge>
            ) : null}
          </div>
          <Tabs defaultValue="tools">
            <TabsList>
              <TabsTrigger value="tools">
                <WrenchIcon aria-hidden="true" /> Tools
              </TabsTrigger>
              <TabsTrigger value="resources">
                <BookOpenIcon aria-hidden="true" /> Resources
              </TabsTrigger>
              <TabsTrigger value="prompts">
                <ScrollTextIcon aria-hidden="true" /> Prompts
              </TabsTrigger>
              <TabsTrigger value="connection">Connection</TabsTrigger>
            </TabsList>
            <TabsContent className="mt-3" value="tools">
              <InventoryList
                empty={
                  liveDetail
                    ? 'This provider reported no tools.'
                    : 'No live inventory is available here; tools are listed when a conversation connects.'
                }
                fallback={serverTools.map((tool) => ({
                  name: tool.name,
                  title: tool.title,
                  description: tool.description,
                }))}
                icon={WrenchIcon}
                rows={toolInventory.data}
              />
            </TabsContent>
            <TabsContent className="mt-3" value="resources">
              <InventoryList
                empty={
                  liveDetail
                    ? 'This provider reported no resources.'
                    : 'No live resource inventory is available here.'
                }
                icon={BookOpenIcon}
                rows={resourceInventory.data}
              />
            </TabsContent>
            <TabsContent className="mt-3" value="prompts">
              <InventoryList
                empty={
                  liveDetail
                    ? 'This provider reported no reusable prompts.'
                    : 'No live prompt inventory is available here.'
                }
                icon={ScrollTextIcon}
                rows={promptInventory.data}
              />
            </TabsContent>
            <TabsContent className="mt-3 max-h-[52dvh] overflow-y-auto" value="connection">
              {detail.data || detailServer ? (
                <McpConnectionDetails server={detail.data || detailServer!} />
              ) : null}
            </TabsContent>
          </Tabs>
          {detail.error ||
          toolInventory.error ||
          resourceInventory.error ||
          promptInventory.error ? (
            <Alert variant="destructive">
              <AlertTitle>Some provider contents are unavailable</AlertTitle>
              <AlertDescription>
                {
                  (
                    detail.error ??
                    toolInventory.error ??
                    resourceInventory.error ??
                    promptInventory.error
                  )?.message
                }
              </AlertDescription>
            </Alert>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog
        onOpenChange={(open) => !open && setDeleteServer(undefined)}
        open={Boolean(deleteServer)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Disconnect {deleteServer ? serverTitle(deleteServer) : 'tool provider'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its tools stop being available to agents in this service process. Existing transcript
              evidence remains readable.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteServer && remove.mutate(deleteServer)}
              variant="destructive"
            >
              Disconnect provider
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ToolCatalogLoading() {
  return (
    <div aria-label="Loading available tools" className="grid gap-2 p-2" role="status">
      <p className="text-sm text-muted-foreground">Loading the agent’s available tools…</p>
      {[0, 1, 2].map((row) => (
        <div className="flex items-center gap-3 rounded-lg border p-3" key={row}>
          <Skeleton className="size-4 rounded" />
          <div className="grid flex-1 gap-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-3/4" />
          </div>
          <Skeleton className="h-6 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}
