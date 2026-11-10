import { SearchIcon, UploadIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton, NamedTooltip } from '@/components/clio/primitives/icon-button';
import { HeldKeyBadge, ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { useCommandKeyHeld } from '@/lib/shortcuts/hooks';
import { cn } from '@/lib/utils';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
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
  attentionControl?: ReactNode;
}

/**
 * The top of the left bar: the CLIO menu, the bell and the collapse button on
 * one line, then New conversation (with import beside it) and Search. Files
 * and Runs left the bar: the crumb and the workspace menu open files, and
 * Search or Ctrl . open runs. Collapsed to icons, the same rows stack.
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
  attentionControl,
}: NavigationHeaderProps) {
  // Collapsed, the toggle moves to the top bar beside the breadcrumb.
  const { state: sidebarState } = useSidebar();
  const commandKeyHeld = useCommandKeyHeld();
  return (
    <SidebarHeader className="gap-2 px-2 pb-1 pt-2.5">
      <SidebarMenu className="flex-row items-center gap-1 in-data-[mobile=true]:pr-10 group-data-[collapsible=icon]:flex-col">
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
        {sidebarState === 'expanded' ? (
          <li className="relative shrink-0 in-data-[mobile=true]:hidden">
            <NamedTooltip label="Hide the left bar" shortcut="left-pocket">
              <SidebarTrigger className="size-7 text-muted-foreground hover:bg-hover hover:text-foreground [&_svg]:size-[15px]" />
            </NamedTooltip>
            <HeldKeyBadge id="left-pocket" />
          </li>
        ) : null}
      </SidebarMenu>
      <SidebarMenu className="gap-px">
        <SidebarMenuItem className="group/new-row">
          <SidebarMenuButton
            className="h-[30px] gap-2.5 pr-9 text-[13px] group-data-[collapsible=icon]:pr-2"
            onClick={onNewSession}
            tooltip="New conversation"
            type="button"
          >
            <NewConversationIcon aria-hidden="true" className="text-primary" />
            <span className="truncate">New conversation</span>
            {sidebarState === 'expanded' ? (
              // The row's end, left of Import: its keys sit there, not under the row.
              <span aria-hidden="true" className="min-w-0 flex-1 self-stretch">
                <HeldKeyBadge id="new-conversation" side="inside-end" />
                <HeldKeyBadge id="new-conversation-browser" side="inside-end" />
              </span>
            ) : (
              <>
                <HeldKeyBadge id="new-conversation" side="end" />
                <HeldKeyBadge id="new-conversation-browser" side="end" />
              </>
            )}
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
        <SidebarMenuItem>
          <SidebarMenuButton
            aria-label="Search work"
            className="h-[30px] gap-2.5 text-[13px]"
            onClick={() => window.dispatchEvent(new Event('clio:open-command-menu'))}
            tooltip="Search work, files, and actions"
            type="button"
          >
            <SearchIcon aria-hidden="true" />
            <span className="truncate">Search</span>
            <ShortcutKeys
              className={cn(
                'ml-auto text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden max-[599px]:hidden',
                // The held badge takes its place.
                commandKeyHeld && 'invisible',
              )}
              id="search"
            />
            <HeldKeyBadge id="search" side={sidebarState === 'expanded' ? 'inside-end' : 'end'} />
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
