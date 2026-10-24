import { queryKeys } from '@/lib/query-keys';
import { EnvironmentTable } from './environment-table';
import { environmentNameProblem, isEnvironmentComment } from '@/lib/environment-names';
import { RemoveSavedMcpDialog } from './settings-saved-mcp';
import { McpServiceList } from './settings-mcp-services';
import { useSavedMcpServices } from '@/hooks/use-saved-mcp-services';
import { mcpServiceEntries } from '@/lib/mcp-service-entries';
import type { McpServerDefinition, SavedMcpService, Workspace } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpenIcon,
  ChevronDownIcon,
  PackagePlusIcon,
  ScrollTextIcon,
  WrenchIcon,
} from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ClioInteractiveRow } from './interactive-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { ClioStatus } from './status';
import { humanizeToolName } from './tool-presentation';

type ConnectionKind = 'http' | 'stdio';

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

function parseProcessSettings(value: string): Record<string, string> {
  const settings: Record<string, string> = {};
  for (const [index, rawLine] of value.split('\n').entries()) {
    const line = rawLine.trim();
    if (!line || isEnvironmentComment(line)) continue;
    const separator = line.indexOf('=');
    if (separator < 1) {
      throw new Error(`Process setting on line ${index + 1} must use NAME=value.`);
    }
    const name = line.slice(0, separator).trim();
    const settingValue = line.slice(separator + 1).trim();
    const problem = environmentNameProblem(name);
    if (problem) throw new Error(`Process setting "${name}" on line ${index + 1} ${problem}.`);
    settings[name] = settingValue;
  }
  return settings;
}

function inventoryTitle(row: Record<string, unknown>) {
  if (typeof row.title === 'string' && row.title) return row.title;
  if (typeof row.name === 'string' && row.name) return humanizeToolName(row.name);
  const value = row.uri ?? row.id;
  return typeof value === 'string' && value ? value : 'Untitled item';
}

function inventoryIdentifier(row: Record<string, unknown>) {
  return typeof row.name === 'string' && row.name !== inventoryTitle(row) ? row.name : '';
}

function inventoryDescription(row: Record<string, unknown>) {
  const value = row.description ?? row.mimeType ?? row.mime_type;
  return typeof value === 'string' ? value : '';
}

export function ToolsSettings({ initialWorkspaceId }: { initialWorkspaceId?: string }) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [workspacePreference, setWorkspacePreference] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const [connectionKind, setConnectionKind] = useState<ConnectionKind>('http');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [argumentsText, setArgumentsText] = useState('');
  const [environmentText, setEnvironmentText] = useState('');
  const [everyConversation, setEveryConversation] = useState(true);
  const [detailServer, setDetailServer] = useState<McpServerDefinition>();
  const [deleteServer, setDeleteServer] = useState<McpServerDefinition>();
  const [removingSaved, setRemovingSaved] = useState<SavedMcpService>();
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
  const detail = useQuery({
    enabled: Boolean(detailServer),
    queryKey: queryKeys.key('mcp-server', settings.endpoint, detailServer?.id),
    queryFn: ({ signal }) => repository.mcpServer(detailServer?.id ?? '', signal),
  });
  const toolInventory = useQuery({
    enabled: Boolean(detailServer),
    queryKey: queryKeys.key('mcp-server-inventory', settings.endpoint, detailServer?.id, 'tools'),
    queryFn: ({ signal }) => repository.mcpServerInventory(detailServer?.id ?? '', 'tools', signal),
  });
  const resourceInventory = useQuery({
    enabled: Boolean(detailServer),
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
    enabled: Boolean(detailServer),
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
  const resetInstallForm = () => {
    setName('');
    setUrl('');
    setCommand('');
    setArgumentsText('');
    setEnvironmentText('');
    setConnectionKind('http');
    setEveryConversation(true);
  };
  // Saved, not only connected: it survives a restart and reaches conversations.
  const install = useMutation({
    mutationFn: () => {
      if (connectionKind === 'http') {
        return repository.configureMcpServer(name.trim(), {
          transport: 'http',
          url: url.trim(),
          always_load: everyConversation,
        });
      }
      const env = parseProcessSettings(environmentText);
      return repository.configureMcpServer(name.trim(), {
        always_load: everyConversation,
        transport: 'stdio',
        command: command.trim(),
        args: argumentsText
          .split('\n')
          .map((argument) => argument.trim())
          .filter(Boolean),
        ...(Object.keys(env).length ? { env } : {}),
      });
    },
    onSuccess: async (saved) => {
      setInstallOpen(false);
      resetInstallForm();
      await invalidate();
      if (saved.status === 'ready') toast.success(`Connected ${saved.name}`);
      else
        toast.warning(`Saved ${saved.name}, but it did not answer`, { description: saved.error });
    },
    onError: (error) => toast.error(error.message),
  });
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
  const canInstall =
    name.trim() && (connectionKind === 'http' ? url.trim() : command.trim()) && !install.isPending;

  return (
    <div className="grid gap-6">
      <SettingsSectionHeading
        description="MCP services give agents tools, data, and reusable prompts. Built-in services ship with the agent; external services are connections you can manage."
        title="MCP tools"
      />
      <section aria-labelledby="mcp-services-heading" className="grid gap-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold" id="mcp-services-heading">
              Services and their tools
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              What a new conversation in this workspace gets: the built-in services, the services
              its agent&apos;s plugins bring, and yours.
            </p>
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-end md:w-auto">
            {workspaces.data?.length ? (
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
            <Button onClick={() => setInstallOpen(true)} size="sm">
              <PackagePlusIcon aria-hidden="true" /> Connect MCP
            </Button>
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
            />
          ) : (
            <p className="text-sm text-muted-foreground">No MCP services were reported.</p>
          )
        ) : null}
      </section>

      <RemoveSavedMcpDialog onClose={() => setRemovingSaved(undefined)} service={removingSaved} />

      <Dialog
        onOpenChange={(open) => {
          setInstallOpen(open);
          if (!open && !install.isPending) resetInstallForm();
        }}
        open={installOpen}
      >
        <DialogContent className="grid max-h-[min(720px,calc(100dvh-2rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Connect an MCP service</DialogTitle>
            <DialogDescription>
              Connect a service that already exposes MCP. The agent checks it before making its
              tools available.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pr-1">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="tool-provider-name">Name</FieldLabel>
                <Input
                  id="tool-provider-name"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Scientific data tools"
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="tool-provider-kind">Connection type</FieldLabel>
                <Select
                  onValueChange={(value) => setConnectionKind(value as ConnectionKind)}
                  value={connectionKind}
                >
                  <SelectTrigger id="tool-provider-kind">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="http">Remote service</SelectItem>
                    <SelectItem value="stdio">Local command</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {connectionKind === 'http' ? (
                <Field>
                  <FieldLabel htmlFor="tool-provider-url">Service address</FieldLabel>
                  <Input
                    id="tool-provider-url"
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://tools.example.org/mcp"
                    type="url"
                    value={url}
                  />
                </Field>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="tool-provider-command">Executable</FieldLabel>
                    <Input
                      id="tool-provider-command"
                      onChange={(event) => setCommand(event.target.value)}
                      placeholder="npx"
                      value={command}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="tool-provider-arguments">Arguments</FieldLabel>
                    <Textarea
                      id="tool-provider-arguments"
                      onChange={(event) => setArgumentsText(event.target.value)}
                      placeholder={'-y\n@organization/tool-provider'}
                      value={argumentsText}
                    />
                    <FieldDescription>Enter one argument per line.</FieldDescription>
                  </Field>
                  <Collapsible>
                    <CollapsibleTrigger asChild>
                      <Button className="w-fit px-0" size="sm" type="button" variant="link">
                        Advanced configuration
                        <ChevronDownIcon aria-hidden="true" />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <Field>
                        <FieldLabel htmlFor="tool-provider-environment">
                          Process settings
                        </FieldLabel>
                        <EnvironmentTable
                          id="tool-provider-environment"
                          onChange={setEnvironmentText}
                          value={environmentText}
                        />
                        <FieldDescription>
                          Environment variables for the service&apos;s process. Values stay with the
                          connected service and are hidden when it is read back.
                        </FieldDescription>
                      </Field>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              )}
            </FieldGroup>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <Checkbox
                checked={everyConversation}
                onCheckedChange={(checked) => setEveryConversation(checked === true)}
              />
              Available in every conversation
            </label>
            {install.error ? (
              <Alert className="mt-4" variant="destructive">
                <AlertTitle>Connection failed</AlertTitle>
                <AlertDescription>{install.error.message}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <DialogFooter>
            <Button onClick={() => setInstallOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button disabled={!canInstall} onClick={() => install.mutate()}>
              {install.isPending ? 'Connecting…' : 'Connect MCP'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        onOpenChange={(open) => !open && setDetailServer(undefined)}
        open={Boolean(detailServer)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{detailServer ? serverTitle(detailServer) : 'MCP service'}</DialogTitle>
            <DialogDescription>
              Tools, resources, and prompts reported by this MCP service.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <ClioStatus
              label={
                detail.isPending
                  ? 'Loading provider'
                  : detail.data?.status === 'ready'
                    ? 'Ready'
                    : humanizeToolName(detail.data?.status ?? 'unavailable')
              }
              value={
                detail.isPending
                  ? 'connecting'
                  : detail.data?.status === 'ready'
                    ? 'healthy'
                    : 'degraded'
              }
            />
            <Badge variant="outline">{detailServer ? connectionLabel(detailServer) : ''}</Badge>
            <Badge variant="outline">{detail.data?.tools_count ?? 0} tools</Badge>
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
            </TabsList>
            <TabsContent className="mt-3" value="tools">
              <InventoryList
                empty="This provider reported no tools."
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
                empty="This provider reported no resources."
                icon={BookOpenIcon}
                rows={resourceInventory.data}
              />
            </TabsContent>
            <TabsContent className="mt-3" value="prompts">
              <InventoryList
                empty="This provider reported no reusable prompts."
                icon={ScrollTextIcon}
                rows={promptInventory.data}
              />
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

function InventoryList({
  rows,
  fallback = [],
  empty,
  icon: Icon,
}: {
  rows?: Array<Record<string, unknown>>;
  fallback?: Array<Record<string, unknown>>;
  empty: string;
  icon: typeof WrenchIcon;
}) {
  const items = rows?.length ? rows : fallback;
  if (!items.length)
    return <p className="rounded-lg border p-5 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="grid max-h-[52vh] gap-2 overflow-y-auto">
      {items.map((row, index) => (
        <ClioInteractiveRow key={`${inventoryTitle(row)}:${index}`}>
          <div className="flex items-start gap-3">
            <Icon aria-hidden="true" className="mt-0.5 size-4 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{inventoryTitle(row)}</p>
              {inventoryDescription(row) ? (
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  {inventoryDescription(row)}
                </p>
              ) : null}
              {inventoryIdentifier(row) ? (
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {inventoryIdentifier(row)}
                </p>
              ) : null}
            </div>
          </div>
        </ClioInteractiveRow>
      ))}
    </div>
  );
}
