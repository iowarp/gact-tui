import { HeldKeyBadge, ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { BrandIcon } from './brand-icon';
import { brand } from '@brand';
import { ArchiveIcon, ChevronDownIcon, FolderGit2Icon, SearchIcon, UploadIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { useCommandKeyHeld, useShortcut } from '@/lib/shortcuts/hooks';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { AgentConnectionIdentity } from './agent-connection-identity';
import { ClioMenuContent } from './clio-menu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ConnectionSettings } from '@/lib/connection';
import {
  connectionAvailability,
  type ConnectionAvailabilityMap,
} from '@/hooks/use-connection-availability';

interface NavigationHeaderProps {
  endpoint: string;
  activeLabel?: string;
  activeLocation?: string;
  currentPath: string;
  connectionAvailabilities: ConnectionAvailabilityMap;
  connections: readonly ConnectionSettings[];
  onConnect: (connection: ConnectionSettings) => void | Promise<void>;
  onNewSession: () => void;
  onNewWorkspace: () => void;
  onImportSession: () => void;
  onOpenArchived: () => void;
  attentionControl?: ReactNode;
}

export function NavigationHeader({
  endpoint,
  activeLabel,
  activeLocation,
  currentPath,
  connectionAvailabilities,
  connections,
  onConnect,
  onNewSession,
  onNewWorkspace,
  onImportSession,
  onOpenArchived,
  attentionControl,
}: NavigationHeaderProps) {
  const activeAvailability = connectionAvailability(connectionAvailabilities, endpoint);
  const commandKeyHeld = useCommandKeyHeld();
  const [menuOpen, setMenuOpen] = useState(false);
  // In a browser Alt Space opens the CLIO menu; Desktop keeps it for its window menu.
  useShortcut('app-menu', () => setMenuOpen(true), { enabled: !inTauri() });

  return (
    <SidebarHeader className="gap-1 px-2 pb-2 pt-2">
      <SidebarMenu className="in-data-[mobile=true]:pr-10">
        <SidebarMenuItem>
          <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="h-10 gap-2"
                size="lg"
                tooltip={`${brand.name}: ${activeAvailability.label}. ${activeAvailability.detail}`}
              >
                <span className="grid size-6 shrink-0 place-items-center text-primary">
                  <BrandIcon className="size-5" />
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-heading font-semibold">{brand.wordmark}</span>
                    <TooltipProvider delayDuration={150}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            aria-label={`Service status: ${activeAvailability.label}. ${activeAvailability.detail}`}
                            className={`size-1.5 shrink-0 rounded-full ${
                              activeAvailability.state === 'healthy'
                                ? 'bg-success'
                                : activeAvailability.state === 'degraded'
                                  ? 'bg-warning'
                                  : activeAvailability.state === 'unavailable'
                                    ? 'bg-muted-foreground/45'
                                    : 'bg-info'
                            }`}
                            role="img"
                            title={`${activeAvailability.label}: ${activeAvailability.detail}`}
                          />
                        </TooltipTrigger>
                        <TooltipContent align="start" className="max-w-72" side="bottom">
                          <span className="font-medium">{activeAvailability.label}</span>
                          <span>{activeAvailability.detail}</span>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    <AgentConnectionIdentity
                      endpoint={endpoint}
                      label={activeLabel}
                      location={activeLocation}
                    />
                  </span>
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-3.5 group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <ClioMenuContent
              activeLabel={activeLabel}
              activeLocation={activeLocation}
              connectionAvailabilities={connectionAvailabilities}
              connections={connections}
              currentPath={currentPath}
              endpoint={endpoint}
              onConnect={onConnect}
            />
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      <SidebarMenu className="flex-row gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
        <SidebarMenuItem className="min-w-0 flex-1 group-data-[collapsible=icon]:flex-none">
          <SidebarMenuButton
            aria-label="Search work"
            className="justify-start group-data-[collapsible=icon]:justify-center"
            onClick={() => window.dispatchEvent(new Event('clio:open-command-menu'))}
            tooltip="Search work, files, and actions"
            type="button"
          >
            <SearchIcon aria-hidden="true" />
            <span className="truncate group-data-[collapsible=icon]:hidden">Search</span>
            <ShortcutKeys
              id="search"
              className={cn(
                'ml-auto text-[10px] group-data-[collapsible=icon]:hidden',
                // The held badge takes its place.
                commandKeyHeld && 'invisible',
              )}
            />
            <HeldKeyBadge id="search" side="inside-end" />
          </SidebarMenuButton>
        </SidebarMenuItem>
        {attentionControl}
        <SidebarMenuItem className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                aria-label="Create or import"
                className="size-8 hover:bg-sidebar-accent"
                tooltip="Create or import"
                type="button"
              >
                <AddIcon aria-hidden="true" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onNewSession}>
                <AddIcon aria-hidden="true" /> New session
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewWorkspace}>
                <FolderGit2Icon aria-hidden="true" /> New workspace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onImportSession}>
                <UploadIcon aria-hidden="true" /> Import session…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenArchived}>
                <ArchiveIcon aria-hidden="true" /> Archived conversations
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}
