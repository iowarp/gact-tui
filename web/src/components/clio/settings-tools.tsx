import { workspaceName } from '@/lib/workspace-labels';
import type { McpServerDefinition, Workspace } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderIcon, WrenchIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useRepository } from '@/hooks/use-repository';
import { useRemoveSavedMcp, useSavedMcpServices } from '@/hooks/use-saved-mcp-services';
import { useExtensionsSupported } from '@/hooks/use-session-agent';
import {
  anyServerPreparing,
  mcpServerPreparation,
  reconnectableNamespace,
} from '@/lib/mcp-preparation';
import { mcpServiceEntries, type McpServiceEntry } from '@/lib/mcp-service-entries';
import {
  serviceEntryTitle,
  serviceOrigin,
  serviceStatus,
  toolSummary,
} from '@/lib/mcp-service-presentation';
import { queryKeys } from '@/lib/query-keys';
import { MCP_PREPARING_POLL_MS } from '@/lib/runtime-limits';
import { newItemKey } from '@/lib/settings-row-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ExtensionAddDialog, ExtensionAddMenu, type ExtensionAdd } from './extension-add-dialog';
import { McpConnectionDetails } from './mcp-connection-details';
import { McpServerPreparationNote } from './mcp-server-preparation';
import { McpSignInDialog } from './mcp-sign-in';
import { SettingsSelectField } from './model-select-field';
import { DetailPane, ListDetailLayout } from './primitives/detail-pane';
import { ItemList, ItemRow } from './primitives/item-row';
import { SegmentedControl } from './primitives/segmented-control';
import { StateView } from './primitives/state-view';
import { StatusIndicator } from './primitives/status-indicator';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { McpServiceIcon, McpServiceList } from './settings-mcp-services';
import { SettingsSectionHeading } from './settings-section-heading';
import { SchemaSection } from './tool-schema-section';
import { humanizeToolName } from './tool-presentation';

function workspaceTitle(workspace: Workspace) {
  return workspaceName(workspace);
}

function matchesFilter(entry: McpServiceEntry, filter: string) {
  if (!filter) return true;
  return [
    entry.server?.name,
    entry.saved?.label,
    entry.saved?.name,
    ...entry.tools.map((tool) => tool.name),
  ]
    .join(' ')
    .toLowerCase()
    .includes(filter);
}

/**
 * The MCP servers a new conversation in the chosen workspace gets — built in,
 * from the agent's plugins, and the person's own — with the selected server's
 * tools, resources, prompts and connection in a pane beside the list.
 */
export function ToolsSettings({
  initialWorkspaceId,
  initialSessionId,
  embedded = false,
  heading = true,
  computerLabel,
  filter = '',
  showAdd = true,
}: {
  initialWorkspaceId?: string;
  initialSessionId?: string;
  embedded?: boolean;
  /** False when a surrounding page (Tools and MCP servers tabs) owns the h1. */
  heading?: boolean;
  computerLabel?: string;
  filter?: string;
  showAdd?: boolean;
}) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [workspacePreference, setWorkspacePreference] = useState('');
  const [adding, setAdding] = useState<ExtensionAdd>();
  const [detailKey, setDetailKey] = useState('');
  const [signingIn, setSigningIn] = useState('');
  const saved = useSavedMcpServices();
  // The empty list's Add follows the toolbar's Add, which states why it waits.
  const addSupported = useExtensionsSupported() === true;

  const workspaces = useQuery({
    queryKey: queryKeys.key('workspaces', settings.endpoint, 'tool-settings'),
    queryFn: ({ signal }) => repository.workspaces(signal),
  });
  const requestedWorkspaceId = workspacePreference || initialWorkspaceId;
  const workspace =
    workspaces.data?.find((row) => row.id === requestedWorkspaceId) ?? workspaces.data?.[0];
  const workspaceId = workspace?.id ?? '';
  const sessionId = workspaceId === initialWorkspaceId ? initialSessionId : undefined;
  const servers = useQuery({
    queryKey: queryKeys.key('mcp-servers', settings.endpoint, workspaceId || 'global', sessionId),
    queryFn: ({ signal }) => repository.mcpServers(workspaceId || undefined, signal, { sessionId }),
    refetchInterval: (query) =>
      anyServerPreparing(query.state.data) ? MCP_PREPARING_POLL_MS : false,
  });
  const tools = useQuery({
    queryKey: queryKeys.key('tools', settings.endpoint),
    queryFn: ({ signal }) => repository.tools(signal),
  });

  const entries = useMemo(
    () => mcpServiceEntries(servers.data ?? [], saved.data ?? [], tools.data ?? []),
    [servers.data, saved.data, tools.data],
  );
  const shown = useMemo(
    () => entries.filter((entry) => matchesFilter(entry, filter)),
    [entries, filter],
  );
  const detailEntry = detailKey ? entries.find((entry) => entry.key === detailKey) : undefined;

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
      toast.success('MCP server reconnected');
    },
    onError: (error) => toast.error(error.message),
  });
  const reconnectSession = useMutation({
    mutationFn: (server: McpServerDefinition) =>
      repository.reconnectSessionMcpServer(sessionId!, reconnectableNamespace(server)),
    onSuccess: async () => {
      await invalidate();
      toast.success('Preparing conversation MCP again');
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (server: McpServerDefinition) => repository.deleteMcpServer(server.id),
    onSuccess: async () => {
      await invalidate();
      toast.success('MCP server disconnected');
    },
    onError: (error) => toast.error(error.message),
  });
  const removeSaved = useRemoveSavedMcp();
  const reconnecting = reconnectSession.isPending
    ? reconnectSession.variables?.id
    : reconnect.isPending
      ? reconnect.variables?.id
      : undefined;
  const startAdding = () => setAdding({ kind: 'remote' });

  const groupLabel = sessionId
    ? embedded
      ? 'MCP services in this conversation'
      : 'Servers in this conversation'
    : embedded
      ? `MCP services on ${computerLabel || settings.location || 'the connected computer'}`
      : 'Servers';

  let list;
  if (servers.isPending || tools.isPending)
    list = <StateView kind="loading" size="row" title="Loading MCP servers…" />;
  else if (servers.error)
    list = (
      <div title={servers.error.message}>
        <StateView
          action={{ label: 'Retry', onClick: () => void servers.refetch() }}
          kind="error"
          size="row"
          title="MCP servers couldn’t be loaded."
        />
      </div>
    );
  else if (!entries.length)
    list = (
      <StateView
        action={showAdd && addSupported ? { label: 'Add server', onClick: startAdding } : undefined}
        kind="empty"
        size="row"
        title="No MCP servers yet."
      />
    );
  else if (!shown.length)
    list = <StateView kind="empty" size="row" title={`No MCP servers match “${filter}”.`} />;
  else
    list = (
      <McpServiceList
        entries={shown}
        label={embedded ? groupLabel : 'MCP servers'}
        onDetails={(entry) => setDetailKey((key) => (key === entry.key ? '' : entry.key))}
        onDisconnect={(server) => remove.mutateAsync(server)}
        onReconnect={(server) => reconnect.mutate(server)}
        onReconnectSession={sessionId ? (server) => reconnectSession.mutate(server) : undefined}
        onRemoveSaved={(service) => removeSaved.mutateAsync(service)}
        reconnecting={reconnecting}
        selectedKey={detailEntry?.key}
      />
    );

  return (
    <div className="@container grid min-w-0 gap-1">
      {!embedded && heading ? (
        <SettingsSectionHeading
          description="MCP services give agents tools, data, and reusable prompts. Built-in services ship with the agent; external services are connections you can manage."
          title="MCP tools"
        />
      ) : null}
      {!embedded && workspaces.data?.length ? (
        // The workspace row spans the section so its edge lines up with the heading and the list.
        <div className="min-w-0 [&>[data-slot=settings-row-frame]]:w-full">
          <SettingsRow
            description="What a new conversation in this workspace gets: the built-in services, the services its agent’s plugins bring, and yours."
            htmlFor="tools-workspace"
            title="Workspace"
          >
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <SettingsSelectField
                  className="w-full"
                  icon={<FolderIcon aria-hidden="true" />}
                  id="tools-workspace"
                  placeholder="Choose a workspace"
                  title={workspace?.path || undefined}
                  value={workspace ? workspaceTitle(workspace) : undefined}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
              >
                <DropdownMenuRadioGroup onValueChange={setWorkspacePreference} value={workspaceId}>
                  {workspaces.data.map((row) => (
                    <DropdownMenuRadioItem
                      key={row.id}
                      title={row.path || undefined}
                      value={row.id}
                    >
                      {workspaceTitle(row)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SettingsRow>
        </div>
      ) : null}
      <section
        aria-label={groupLabel}
        className="grid min-w-0"
        onKeyDown={newItemKey(showAdd && addSupported ? startAdding : undefined)}
      >
        <SettingsGroupLabel
          actions={
            showAdd ? (
              <span className="text-foreground">
                <ExtensionAddMenu
                  label={embedded ? undefined : 'Add'}
                  mcpOnly
                  onChoose={setAdding}
                />
              </span>
            ) : undefined
          }
          className="mb-1"
        >
          {groupLabel}
        </SettingsGroupLabel>
        {tools.error ? (
          <div title={tools.error.message}>
            <StateView
              action={{ label: 'Retry', onClick: () => void tools.refetch() }}
              kind="error"
              size="row"
              title="Tool descriptions couldn’t be loaded; the servers are listed without them."
            />
          </div>
        ) : null}
        <ListDetailLayout
          detail={
            detailEntry ? (
              <McpServerDetailPane
                entry={detailEntry}
                key={detailEntry.key}
                onClose={() => setDetailKey('')}
                onReconnectSession={
                  sessionId ? (server) => reconnectSession.mutateAsync(server) : undefined
                }
                reconnecting={Boolean(detailEntry.server && reconnecting === detailEntry.server.id)}
              />
            ) : undefined
          }
          list={list}
        />
      </section>

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
    </div>
  );
}

type DetailView = 'tools' | 'resources' | 'prompts' | 'connection';

const DETAIL_VIEWS: { value: DetailView; label: string }[] = [
  { value: 'tools', label: 'Tools' },
  { value: 'resources', label: 'Resources' },
  { value: 'prompts', label: 'Prompts' },
  { value: 'connection', label: 'Connection' },
];

/** One server beside the list: its state, then tools, resources, prompts or connection. */
function McpServerDetailPane({
  entry,
  onClose,
  onReconnectSession,
  reconnecting,
}: {
  entry: McpServiceEntry;
  onClose: () => void;
  onReconnectSession?: (server: McpServerDefinition) => Promise<unknown>;
  reconnecting: boolean;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [view, setView] = useState<DetailView>('tools');
  const title = serviceEntryTitle(entry);
  const id = entry.server?.id ?? '';
  // Declared namespaces are not installed-server API identities. Inspect their
  // recorded configuration without starting a conversation or probing a false ID.
  const live = Boolean(id && !/^(?:draft|session)_mcp_/u.test(id));
  const detail = useQuery({
    enabled: live,
    queryKey: queryKeys.key('mcp-server', settings.endpoint, id),
    queryFn: ({ signal }) => repository.mcpServer(id, signal),
  });
  const toolInventory = useQuery({
    enabled: live,
    queryKey: queryKeys.key('mcp-server-inventory', settings.endpoint, id, 'tools'),
    queryFn: ({ signal }) => repository.mcpServerInventory(id, 'tools', signal),
  });
  const resourceInventory = useQuery({
    enabled: live,
    queryKey: queryKeys.key('mcp-server-inventory', settings.endpoint, id, 'resources'),
    queryFn: ({ signal }) => repository.mcpServerInventory(id, 'resources', signal),
  });
  const server = detail.data ?? entry.server;
  const status =
    live && detail.isPending
      ? { label: 'Checking', tone: 'running' as const }
      : serviceStatus(server);
  const toolRows: Array<Record<string, unknown>> = toolInventory.data?.length
    ? toolInventory.data
    : entry.tools.length
      ? entry.tools.map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
        }))
      : (server?.tools ?? []).map((name) => ({ name }));
  const failure = detail.error ?? toolInventory.error ?? resourceInventory.error;
  const connectionError = server?.error && !mcpServerPreparation(server) ? server.error : undefined;
  const technical = [connectionError, failure?.message].filter(Boolean) as string[];

  return (
    <DetailPane
      icon={<McpServiceIcon entry={entry} />}
      onClose={onClose}
      tabs={
        <SegmentedControl
          label="Server details view"
          onValueChange={setView}
          options={DETAIL_VIEWS}
          value={view}
        />
      }
      title={title}
    >
      <div className="flex min-w-0 items-center gap-3 pb-2 text-meta text-muted-foreground">
        <StatusIndicator label={status.label} tone={status.tone} />
        <span className="min-w-0 truncate">{serviceOrigin(entry)}</span>
      </div>
      {server ? (
        <McpServerPreparationNote
          className="mb-2"
          onReconnect={onReconnectSession ? () => onReconnectSession(server) : undefined}
          reconnecting={reconnecting}
          server={server}
          title={title}
        />
      ) : null}
      {connectionError && view !== 'connection' ? (
        <p className="mb-2 text-xs text-muted-foreground">
          The service didn’t connect.{' '}
          <button
            className="text-link underline-offset-2 outline-none hover:underline focus-visible:underline"
            onClick={() => setView('connection')}
            type="button"
          >
            Show the error
          </button>
        </p>
      ) : null}
      {failure && view !== 'connection' ? (
        <StateView
          className="mb-2"
          kind="error"
          size="row"
          title="Some contents are unavailable."
        />
      ) : null}
      {view === 'tools' ? (
        <InventoryRows
          empty={
            live ? 'This server reported no tools.' : 'Tools appear when a conversation connects.'
          }
          icon={<WrenchIcon aria-hidden="true" />}
          label={`Tools of ${title}`}
          rows={toolRows}
        />
      ) : view === 'resources' ? (
        <InventoryRows
          empty={
            live
              ? 'This server reported no resources.'
              : 'Resources appear when a conversation connects.'
          }
          label={`Resources of ${title}`}
          rows={resourceInventory.data ?? []}
        />
      ) : view === 'prompts' ? (
        <p className="py-2 text-ui text-muted-foreground">
          This service’s prompts are commands. In a conversation that uses it, type / and look under
          its prompts, or see them on the Prompts settings page.
        </p>
      ) : (
        <div className="grid gap-2 py-1">
          {server || entry.saved ? (
            <McpConnectionDetails server={(server ?? entry.saved)!} />
          ) : null}
          {entry.saved?.always_load ? (
            <p className="text-xs text-muted-foreground">Available in every conversation</p>
          ) : null}
          {technical.length ? (
            <div className="min-w-0 border-t border-border/70 pt-2" data-slot="technical-details">
              <p className="text-xs font-medium text-muted-foreground">Technical details</p>
              {technical.map((text) => (
                <p
                  className="mt-1 font-mono text-label break-words text-muted-foreground"
                  key={text}
                >
                  {text}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </DetailPane>
  );
}

function rowText(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function inventoryTitle(row: Record<string, unknown>) {
  const name = rowText(row, 'name');
  return (
    rowText(row, 'title') ||
    (name ? humanizeToolName(name) : '') ||
    rowText(row, 'uri') ||
    rowText(row, 'id') ||
    'Untitled item'
  );
}

/** Tools or resources as small item rows; one with declared inputs opens them below it. */
function InventoryRows({
  rows,
  label,
  empty,
  icon,
}: {
  rows: Array<Record<string, unknown>>;
  label: string;
  empty: string;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState('');
  if (!rows.length) return <StateView className="py-6" kind="empty" size="row" title={empty} />;
  return (
    <ItemList className="border-t border-border/70" label={label}>
      {rows.map((row, index) => {
        const name = rowText(row, 'name');
        const description =
          rowText(row, 'description') || rowText(row, 'mimeType') || rowText(row, 'mime_type');
        const summary = name ? toolSummary(name, { description }) : description;
        const schema =
          row.inputSchema && typeof row.inputSchema === 'object'
            ? (row.inputSchema as Record<string, unknown>)
            : undefined;
        const key = `${name || inventoryTitle(row)}:${index}`;
        const expanded = open === key;
        const toggle = () => setOpen(expanded ? '' : key);
        return (
          <div key={key}>
            <ItemRow
              aria-expanded={schema ? expanded : undefined}
              icon={icon ?? <WrenchIcon aria-hidden="true" />}
              meta={summary || undefined}
              onClick={schema ? toggle : undefined}
              onKeyDown={
                schema
                  ? (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      toggle();
                    }
                  : undefined
              }
              role={schema ? 'button' : undefined}
              size="sm"
              tabIndex={schema ? 0 : undefined}
              title={
                <span title={[name, description].filter(Boolean).join('\n')}>
                  {inventoryTitle(row)}
                </span>
              }
            />
            {schema && expanded ? (
              <div className="border-b border-border/70 px-2 py-2 pl-9">
                <SchemaSection empty="No inputs declared." schema={schema} title="" />
              </div>
            ) : null}
          </div>
        );
      })}
    </ItemList>
  );
}
