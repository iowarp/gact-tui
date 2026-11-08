import { ActivityIcon, FolderOpenIcon, SearchIcon, UploadIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IconButton, NamedTooltip } from '@/components/clio/primitives/icon-button';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { ConnectionAvailabilityMap } from '@/hooks/use-connection-availability';
import type { ConnectionSettings } from '@/lib/connection';
import { NewConversationIcon } from '@/lib/icon-vocabulary';
import { NavigationAgentMenu } from './navigation-agent-menu';

interface NavigationHeaderProps {
  endpoint: string;
  activeLabel?: string;
  activeLocation?: string;
  currentPath: string;
  connectionAvailabilities: ConnectionAvailabilityMap;
  connections: readonly ConnectionSettings[];
  onConnect: (connection: ConnectionSettings) => void | Promise<void>;
  onNewSession: () => void;
  onImportSession: () => void;
  /** Opens the active workspace's files; the row is left out without one. */
  onOpenFiles?: () => void;
  attentionControl?: ReactNode;
}

/**
 * The top of the left bar: the agent you're talking to, the bell and the
 * collapse button on one line, then New conversation (with import beside
 * it), Search, Files and Runs. Collapsed to icons, the same rows stack.
 */
export function NavigationHeader({
  endpoint,
  activeLabel,
  activeLocation,
  currentPath,
  connectionAvailabilities,
  connections,
  onConnect,
  onNewSession,
  onImportSession,
  onOpenFiles,
  attentionControl,
}: NavigationHeaderProps) {
  return (
    <SidebarHeader className="gap-2 px-2 pb-1 pt-2">
      <SidebarMenu className="flex-row items-center gap-0.5 in-data-[mobile=true]:pr-10 group-data-[collapsible=icon]:flex-col">
        <SidebarMenuItem className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
          <NavigationAgentMenu
            activeLabel={activeLabel}
            activeLocation={activeLocation}
            connectionAvailabilities={connectionAvailabilities}
            connections={connections}
            currentPath={currentPath}
            endpoint={endpoint}
            onConnect={onConnect}
          />
        </SidebarMenuItem>
        {attentionControl}
        <li className="shrink-0 in-data-[mobile=true]:hidden">
          <NamedTooltip label="Hide the left bar" shortcut="left-pocket">
            <SidebarTrigger className="size-7 text-muted-foreground hover:bg-hover hover:text-foreground" />
          </NamedTooltip>
        </li>
      </SidebarMenu>
      <SidebarMenu className="gap-px">
        <SidebarMenuItem className="group/new-row">
          <SidebarMenuButton
            className="pr-9 font-medium group-data-[collapsible=icon]:pr-2"
            onClick={onNewSession}
            tooltip="New conversation"
            type="button"
          >
            <NewConversationIcon aria-hidden="true" className="text-primary" />
            <span className="truncate">New conversation</span>
          </SidebarMenuButton>
          <IconButton
            className="absolute right-1 top-1/2 -translate-y-1/2 group-data-[collapsible=icon]:hidden"
            icon={<UploadIcon />}
            label="Import conversation…"
            onClick={onImportSession}
            shortcut="import-conversation"
            size="sm"
          />
        </SidebarMenuItem>
        <SidebarMenuItem className="group/search-row">
          <SidebarMenuButton
            aria-label="Search work"
            onClick={() => window.dispatchEvent(new Event('clio:open-command-menu'))}
            tooltip="Search work, files, and actions"
            type="button"
          >
            <SearchIcon aria-hidden="true" />
            <span className="truncate">Search</span>
            <ShortcutKeys
              className="ml-auto text-[10px] opacity-0 transition-opacity group-data-[collapsible=icon]:hidden group-hover/search-row:opacity-100 group-focus-within/search-row:opacity-100"
              id="search"
            />
          </SidebarMenuButton>
        </SidebarMenuItem>
        {onOpenFiles ? (
          <SidebarMenuItem>
            <SidebarMenuButton onClick={onOpenFiles} tooltip="Files" type="button">
              <FolderOpenIcon aria-hidden="true" />
              <span className="truncate">Files</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ) : null}
        <SidebarMenuItem>
          <SidebarMenuButton asChild tooltip="Runs">
            <Link state={{ endpoint, from: currentPath }} to="/runs">
              <ActivityIcon aria-hidden="true" />
              <span className="truncate">Runs</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
