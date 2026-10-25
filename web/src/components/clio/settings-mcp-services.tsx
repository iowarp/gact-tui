import type { McpServerDefinition, SavedMcpService, ToolCatalogItem } from '@clio/core/v3';
import type { McpServiceEntry } from '@/lib/mcp-service-entries';
import { BlocksIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import { DeleteIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { truncate } from '@/lib/format';
import { SUMMARY_TRUNCATE_CHARS } from '@/lib/runtime-limits';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RefreshIndicator } from './refresh-button';
import { ClioStatus, type ClioStatusValue } from './status';
import { humanizeToolName } from './tool-presentation';

/**
 * Every MCP service a conversation in the chosen workspace gets — built in, from the
 * agent's plugins, and the person's own — each listing the tools it brings, open.
 */
export function McpServiceList({
  entries,
  reconnecting,
  onDetails,
  onReconnect,
  onDisconnect,
  onRemoveSaved,
  defaultOpen = true,
  showConnection = true,
}: {
  entries: McpServiceEntry[];
  reconnecting?: string;
  onDetails: (server: McpServerDefinition) => void;
  onReconnect: (server: McpServerDefinition) => void;
  onDisconnect: (server: McpServerDefinition) => void;
  onRemoveSaved: (service: SavedMcpService) => void;
  defaultOpen?: boolean;
  showConnection?: boolean;
}) {
  return (
    <ul
      aria-label="MCP services"
      className="min-w-0 divide-y divide-border/70 border-y border-border/70"
    >
      {entries.map((entry) => (
        <McpServiceItem
          entry={entry}
          key={entry.key}
          onDetails={onDetails}
          onDisconnect={onDisconnect}
          onReconnect={onReconnect}
          onRemoveSaved={onRemoveSaved}
          reconnecting={Boolean(entry.server && reconnecting === entry.server.id)}
          defaultOpen={defaultOpen}
          showConnection={showConnection}
        />
      ))}
    </ul>
  );
}

function McpServiceItem({
  entry,
  reconnecting,
  onDetails,
  onReconnect,
  onDisconnect,
  onRemoveSaved,
  defaultOpen,
  showConnection,
}: {
  entry: McpServiceEntry;
  reconnecting: boolean;
  onDetails: (server: McpServerDefinition) => void;
  onReconnect: (server: McpServerDefinition) => void;
  onDisconnect: (server: McpServerDefinition) => void;
  onRemoveSaved: (service: SavedMcpService) => void;
  defaultOpen: boolean;
  showConnection: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { server, saved } = entry;
  const state = serviceState(entry);
  const toolNames = entry.tools.length
    ? entry.tools.map((tool) => tool.name)
    : (server?.tools ?? []);
  const title = serviceTitle(entry);
  const runtime = server ? server.id.startsWith('mcp_ext_') : false;
  return (
    <li className="min-w-0">
      <Collapsible onOpenChange={setOpen} open={open}>
        <div className="flex min-w-0 items-start gap-2 py-3">
          <CollapsibleTrigger asChild>
            <button
              aria-label={`${open ? 'Hide' : 'Show'} the tools of ${title}`}
              className="mt-0.5 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              type="button"
            >
              <ChevronRightIcon
                aria-hidden="true"
                className={cn('size-4 transition-transform duration-150', open && 'rotate-90')}
              />
            </button>
          </CollapsibleTrigger>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-medium">{title}</h3>
              <span className="text-xs text-muted-foreground">
                {origin(entry)} · {countLabel(toolNames.length, state.known)}
              </span>
            </div>
            {saved && showConnection ? (
              <p className="mt-0.5 break-all font-mono text-xs text-muted-foreground">
                {savedTarget(saved)}
              </p>
            ) : null}
            {server?.error ? <p className="mt-1 text-xs text-destructive">{server.error}</p> : null}
          </div>
          <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <ClioStatus className="size-4" compact label={state.label} value={state.value} />
            <span aria-hidden="true">{state.label}</span>
          </span>
          <ServiceActions
            onDetails={server ? () => onDetails(server) : undefined}
            onDisconnect={runtime && server ? () => onDisconnect(server) : undefined}
            onReconnect={runtime && server ? () => onReconnect(server) : undefined}
            onRemoveSaved={saved ? () => onRemoveSaved(saved) : undefined}
            reconnecting={reconnecting}
            title={title}
          />
        </div>
        <CollapsibleContent>
          {toolNames.length ? (
            <ul aria-label={`Tools of ${title}`} className="mb-3 ml-7 min-w-0">
              {toolNames.map((name) => (
                <ToolLine
                  key={name}
                  name={name}
                  tool={entry.tools.find((tool) => tool.name === name)}
                />
              ))}
            </ul>
          ) : (
            <p className="mb-3 ml-7 text-xs text-muted-foreground">{state.empty}</p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function ToolLine({ name, tool }: { name: string; tool?: ToolCatalogItem }) {
  const [open, setOpen] = useState(false);
  const title = tool?.title?.trim() || name;
  return (
    <li>
      <Collapsible onOpenChange={setOpen} open={open}>
        <CollapsibleTrigger asChild>
          <button
            aria-label={`${title}: ${open ? 'hide' : 'show'} details`}
            className="flex w-full min-w-0 flex-col gap-0.5 rounded-sm px-1 py-1.5 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-ring sm:flex-row sm:items-baseline sm:gap-3"
            type="button"
          >
            <span className={cn('shrink-0 text-sm', !tool?.title && 'font-mono text-[13px]')}>
              {title}
            </span>
            <span className="min-w-0 flex-1 text-xs text-muted-foreground sm:truncate">
              {toolSummary(name, tool)}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid gap-1 pb-2 pl-1 text-xs text-muted-foreground">
          <p>
            Identifier <code className="font-mono text-foreground">{name}</code>
          </p>
          {tool?.description ? (
            <p className="max-w-3xl whitespace-pre-line leading-5">{tool.description}</p>
          ) : (
            <p>The service describes this tool once it connects.</p>
          )}
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function ServiceActions({
  title,
  reconnecting,
  onDetails,
  onReconnect,
  onDisconnect,
  onRemoveSaved,
}: {
  title: string;
  reconnecting: boolean;
  onDetails?: () => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  onRemoveSaved?: () => void;
}) {
  if (!onDetails && !onReconnect && !onDisconnect && !onRemoveSaved) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-busy={reconnecting}
          aria-label={`Actions for ${title}`}
          disabled={reconnecting}
          size="icon-sm"
          variant="ghost"
        >
          {reconnecting ? <RefreshIndicator refreshing /> : <MoreIcon aria-hidden="true" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        {onDetails ? (
          <DropdownMenuItem onSelect={onDetails}>
            <BlocksIcon aria-hidden="true" /> Service details
          </DropdownMenuItem>
        ) : null}
        {onReconnect ? (
          <DropdownMenuItem onSelect={onReconnect}>
            <RefreshIndicator refreshing={reconnecting} /> Reconnect
          </DropdownMenuItem>
        ) : null}
        {onDisconnect || onRemoveSaved ? <DropdownMenuSeparator /> : null}
        {onDisconnect ? (
          <DropdownMenuItem onSelect={onDisconnect} variant="destructive">
            <DeleteIcon aria-hidden="true" /> Disconnect
          </DropdownMenuItem>
        ) : null}
        {onRemoveSaved ? (
          <DropdownMenuItem onSelect={onRemoveSaved} variant="destructive">
            <DeleteIcon aria-hidden="true" /> Remove
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function serviceTitle(entry: McpServiceEntry): string {
  const server = entry.server;
  if (server?.transport === 'in_process') {
    if (server.name === 'fs') return 'Workspace files';
    if (server.name === 'shell') return 'Local commands';
    return humanizeToolName(server.name || server.id);
  }
  return entry.name;
}

function origin(entry: McpServiceEntry): string {
  const server = entry.server;
  if (server?.transport === 'in_process') return 'Built in';
  if (server?.source === 'plugin')
    return server.plugin ? `From plugin ${server.plugin}` : 'From a plugin';
  const saved = entry.saved;
  if (saved)
    return `Yours, ${saved.transport === 'http' ? 'remote service' : 'local command'}${
      saved.always_load ? ', every conversation' : ''
    }`;
  if (server?.transport === 'http' || server?.transport === 'streamable-http')
    return 'Remote service';
  return 'Local command';
}

function serviceState(entry: McpServiceEntry): {
  label: string;
  value: ClioStatusValue;
  known: boolean;
  empty: string;
} {
  const server = entry.server;
  if (!server)
    return {
      label: 'Not started',
      value: 'pending',
      known: false,
      empty: 'Starts in a conversation that uses it; its tools are listed once it connects.',
    };
  if (server.status === 'ready')
    return {
      label: 'Running',
      value: 'healthy',
      known: true,
      empty: 'This service offers no tools.',
    };
  if (server.status === 'available')
    return {
      label: 'Starts when used',
      value: 'pending',
      known: server.tools.length > 0,
      empty: 'Starts in a conversation that uses it; its tools are listed once it connects.',
    };
  return {
    label: humanizeToolName(server.status) || 'Unavailable',
    value: 'degraded',
    known: server.tools.length > 0,
    empty: server.error || 'The service did not report its tools.',
  };
}

function countLabel(count: number, known: boolean): string {
  if (!count && !known) return 'tools not known yet';
  return `${count} ${count === 1 ? 'tool' : 'tools'}`;
}

function savedTarget(service: SavedMcpService): string {
  const spec = service.spec;
  if (service.transport === 'http') return String(spec.url ?? '');
  const args = Array.isArray(spec.args) ? spec.args.map(String) : [];
  return [String(spec.command ?? ''), ...args].join(' ');
}

const KNOWN_SUMMARIES: Record<string, string> = {
  fs_read_file: 'Reads a file that this workspace has granted the agent access to.',
  fs_write_file:
    'Creates a file or replaces its content in the workspace; each change can be undone.',
  fs_edit_file: 'Replaces exact text in a workspace file; each change can be undone.',
  shell_bash: 'Runs a command inside the workspace’s permitted folders.',
};

function toolSummary(name: string, tool?: ToolCatalogItem): string {
  if (KNOWN_SUMMARIES[name]) return KNOWN_SUMMARIES[name];
  const description = tool?.description
    ?.replace(/``(.+?)``/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!description) return '';
  const firstSentence = description.match(/^.*?[.!?](?:\s|$)/u)?.[0]?.trim() ?? description;
  return truncate(firstSentence, SUMMARY_TRUNCATE_CHARS);
}
