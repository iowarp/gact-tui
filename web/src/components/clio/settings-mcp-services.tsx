import type { McpServerDefinition, SavedMcpService } from '@clio/core/v3';
import {
  FolderIcon,
  GlobeIcon,
  ServerIcon,
  TerminalIcon,
  UnplugIcon,
  type LucideIcon,
} from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteIcon, InfoIcon, MoreIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import type { McpServiceEntry } from '@/lib/mcp-service-entries';
import {
  serviceEntryTitle,
  serviceKind,
  serviceOrigin,
  serviceStatus,
  serviceTarget,
  type McpServiceKind,
} from '@/lib/mcp-service-presentation';
import { reconnectableNamespace } from '@/lib/mcp-preparation';
import { IconButton } from './primitives/icon-button';
import { ItemList, ItemRow } from './primitives/item-row';
import { ShortcutKeys } from './primitives/key-chip';
import { MenuRow } from './primitives/menu-row';
import { StatusIndicator } from './primitives/status-indicator';
import { SlotButton } from './extension-parts';
import { RefreshIndicator } from './refresh-button';

const KIND_ICONS: Record<McpServiceKind, LucideIcon> = {
  files: FolderIcon,
  commands: TerminalIcon,
  plugin: ServerIcon,
  remote: GlobeIcon,
  local: TerminalIcon,
};

export function McpServiceIcon({ entry }: { entry: Pick<McpServiceEntry, 'server' | 'saved'> }) {
  const Icon = KIND_ICONS[serviceKind(entry)];
  return <Icon aria-hidden="true" />;
}

/** How many tools the entry is known to bring, or undefined while that is unknown. */
function serviceToolTotal(entry: McpServiceEntry): number | undefined {
  const server = entry.server;
  if (!server) return undefined;
  const count = Math.max(entry.tools.length, server.tools.length, server.tools_count ?? 0);
  return server.status === 'ready' || count > 0 ? count : undefined;
}

function countWords(count: number): string {
  return `${count} ${count === 1 ? 'tool' : 'tools'}`;
}

/**
 * The meta line: where the service comes from, its tools, and the remote host (mono).
 * Commands stay in the details pane's Connection view.
 */
export function McpServiceMeta({ entry }: { entry: McpServiceEntry }) {
  const origin = serviceOrigin(entry);
  const total = serviceToolTotal(entry);
  const address = serviceTarget(entry);
  const target = address?.kind === 'url' ? address : undefined;
  const words = [origin, total === undefined ? '' : countWords(total), target?.short ?? '']
    .filter(Boolean)
    .join(', ');
  return (
    <span title={words}>
      <span>{origin}</span>
      {total === undefined ? null : <span className="ml-2.5">{countWords(total)}</span>}
      {target ? (
        <span className="ml-2.5 font-mono text-[0.71875rem] whitespace-nowrap">{target.short}</span>
      ) : null}
    </span>
  );
}

/** A runtime-installed server (the backend names those `mcp_ext_…`) can be reconnected and disconnected. */
function runtimeServer(server: McpServerDefinition | undefined): server is McpServerDefinition {
  return Boolean(server?.id.startsWith('mcp_ext_'));
}

/**
 * Every MCP service a conversation in the chosen workspace gets — built in, from
 * the agent's plugins, and the person's own — one item row each: what it is,
 * where it comes from, its state in words, and its actions on hover.
 */
export function McpServiceList({
  entries,
  label = 'MCP servers',
  reconnecting,
  selectedKey,
  onDetails,
  onReconnect,
  onReconnectSession,
  onDisconnect,
  onRemoveSaved,
}: {
  entries: McpServiceEntry[];
  label?: string;
  /** The id of the server whose reconnect is in flight. */
  reconnecting?: string;
  /** The entry whose details are open beside the list. */
  selectedKey?: string;
  onDetails?: (entry: McpServiceEntry) => void;
  onReconnect: (server: McpServerDefinition) => void;
  /** Prepares a conversation's own server again (see `reconnectableNamespace`). */
  onReconnectSession?: (server: McpServerDefinition) => unknown | Promise<unknown>;
  onDisconnect: (server: McpServerDefinition) => void;
  onRemoveSaved: (service: SavedMcpService) => void;
}) {
  const rows = entries.map((entry) => {
    const server = entry.server;
    const status = serviceStatus(server);
    const reconnect =
      status.tone === 'running'
        ? undefined
        : runtimeServer(server)
          ? () => onReconnect(server)
          : server && onReconnectSession && reconnectableNamespace(server)
            ? () => void onReconnectSession(server)
            : undefined;
    return { entry, status, reconnect, failed: status.tone === 'error' && Boolean(reconnect) };
  });
  const anySlot = rows.some((row) => row.failed);
  return (
    <ItemList className="border-t border-border/70" label={label}>
      {rows.map(({ entry, status, reconnect, failed }) => (
        <McpServiceRow
          entry={entry}
          key={entry.key}
          onDetails={onDetails ? () => onDetails(entry) : undefined}
          onDisconnect={runtimeServer(entry.server) ? () => onDisconnect(entry.server!) : undefined}
          onReconnect={reconnect}
          onRemoveSaved={entry.saved ? () => onRemoveSaved(entry.saved!) : undefined}
          reconnecting={Boolean(entry.server && reconnecting === entry.server.id)}
          selected={selectedKey === entry.key}
          showSlot={anySlot}
          failed={failed}
          status={status}
        />
      ))}
    </ItemList>
  );
}

function McpServiceRow({
  entry,
  status,
  reconnecting,
  selected,
  showSlot,
  failed,
  onDetails,
  onReconnect,
  onDisconnect,
  onRemoveSaved,
}: {
  entry: McpServiceEntry;
  status: ReturnType<typeof serviceStatus>;
  reconnecting: boolean;
  selected: boolean;
  showSlot: boolean;
  failed: boolean;
  onDetails?: () => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
  onRemoveSaved?: () => void;
}) {
  const title = serviceEntryTitle(entry);
  const open = (event: MouseEvent<HTMLDivElement>) => {
    // Buttons and menu items (portaled, but still bubbling through React) do their own thing.
    if ((event.target as Element).closest('button, a, [role="menuitem"], [role="menu"]')) return;
    onDetails?.();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter' && onDetails) {
      event.preventDefault();
      onDetails();
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      const remove = onRemoveSaved ?? onDisconnect;
      if (!remove) return;
      event.preventDefault();
      remove();
    }
  };
  const hasMenu = Boolean(onDetails || onReconnect || onDisconnect || onRemoveSaved);
  const slot =
    showSlot && failed && onReconnect ? (
      <SlotButton disabled={reconnecting} label={`Reconnect ${title}`} onClick={onReconnect}>
        Reconnect
      </SlotButton>
    ) : null;
  return (
    <ItemRow
      actions={
        hasMenu ? (
          <>
            {onDetails ? (
              <IconButton
                aria-pressed={selected}
                icon={<InfoIcon />}
                label={`Details for ${title}`}
                onClick={onDetails}
              />
            ) : null}
            {onReconnect && !slot ? (
              <IconButton
                aria-busy={reconnecting}
                disabled={reconnecting}
                icon={<RefreshIndicator refreshing={reconnecting} />}
                label={`Reconnect ${title}`}
                onClick={onReconnect}
              />
            ) : null}
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <IconButton icon={<MoreIcon />} label={`Actions for ${title}`} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {onDetails ? (
                  <DropdownMenuItem onSelect={onDetails}>
                    <MenuRow icon={<InfoIcon />} label="Details" />
                    <ShortcutKeys className="shrink-0 pl-2" keys={['Enter']} variant="text" />
                  </DropdownMenuItem>
                ) : null}
                {onReconnect ? (
                  <DropdownMenuItem disabled={reconnecting} onSelect={onReconnect}>
                    <MenuRow icon={<RefreshIcon />} label="Reconnect" />
                  </DropdownMenuItem>
                ) : null}
                {onDisconnect ? (
                  <DropdownMenuItem onSelect={onDisconnect}>
                    <MenuRow icon={<UnplugIcon />} label="Disconnect" />
                  </DropdownMenuItem>
                ) : null}
                {onRemoveSaved && (onDetails || onReconnect || onDisconnect) ? (
                  <DropdownMenuSeparator />
                ) : null}
                {onRemoveSaved ? (
                  <DropdownMenuItem onSelect={onRemoveSaved}>
                    <MenuRow icon={<DeleteIcon />} label="Remove saved" />
                    <ShortcutKeys
                      className="shrink-0 pl-2"
                      keys={['Delete']}
                      mac={['Backspace']}
                      variant="text"
                    />
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : null
      }
      actionsVisible={reconnecting}
      aria-current={selected || undefined}
      className={onDetails ? 'cursor-default' : undefined}
      data-mcp-service={entry.key}
      icon={<McpServiceIcon entry={entry} />}
      meta={<McpServiceMeta entry={entry} />}
      onClick={open}
      onKeyDown={onKeyDown}
      selected={selected}
      slot={slot}
      status={<StatusIndicator label={status.label} tone={status.tone} />}
      tabIndex={0}
      title={<span title={title}>{title}</span>}
    />
  );
}
