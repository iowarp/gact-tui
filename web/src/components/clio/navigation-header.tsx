import { brand } from '@brand';
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  FolderGit2Icon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ConnectionAvailabilityIndicator } from '@/components/clio/connection-availability';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import type { SavedConnection } from '@/lib/connection';
import {
  connectionAvailability,
  type ConnectionAvailabilityMap,
} from '@/hooks/use-connection-availability';

interface NavigationHeaderProps {
  endpoint: string;
  activeLabel?: string;
  currentPath: string;
  connectionAvailabilities: ConnectionAvailabilityMap;
  recentConnections: readonly SavedConnection[];
  onConnect: (connection: SavedConnection) => void | Promise<void>;
  onNewSession: () => void;
  onNewWorkspace: () => void;
  onImportSession: () => void;
  onOpenArchived: () => void;
  attentionControl?: ReactNode;
}

export function NavigationHeader({
  endpoint,
  activeLabel,
  currentPath,
  connectionAvailabilities,
  recentConnections,
  onConnect,
  onNewSession,
  onNewWorkspace,
  onImportSession,
  onOpenArchived,
  attentionControl,
}: NavigationHeaderProps) {
  const logoSource =
    brand.logoImage ??
    (brand.logoSvg ? `data:image/svg+xml,${encodeURIComponent(brand.logoSvg)}` : null);
  const activeAvailability = connectionAvailability(connectionAvailabilities, endpoint);

  return (
    <SidebarHeader className="gap-2 border-b border-sidebar-border/70 p-2">
      <SidebarMenu className="in-data-[mobile=true]:pr-10">
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton className="h-11" size="lg" tooltip={`${brand.name} service`}>
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
                  {logoSource ? (
                    <img alt="" className="size-7 object-contain" src={logoSource} />
                  ) : (
                    <span aria-hidden="true" className="font-semibold">
                      {brand.markGlyph}
                    </span>
                  )}
                </span>
                <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-heading font-semibold">{brand.wordmark}</span>
                    <span
                      aria-hidden="true"
                      className={`size-1.5 shrink-0 rounded-full ${
                        activeAvailability.state === 'healthy'
                          ? 'bg-success'
                          : activeAvailability.state === 'degraded'
                            ? 'bg-warning'
                            : activeAvailability.state === 'unavailable'
                              ? 'bg-muted-foreground/45'
                              : 'bg-info'
                      }`}
                    />
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">
                    {connectionPlaceLabel(endpoint, activeLabel)}
                  </span>
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-3.5 group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-96">
              <DropdownMenuLabel>
                <span className="block">Agent services</span>
                <span className="block truncate font-mono text-[11px] font-normal text-muted-foreground">
                  {endpoint}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {recentConnections.map((recent) => {
                const availability = connectionAvailability(
                  connectionAvailabilities,
                  recent.endpoint,
                );
                return (
                  <DropdownMenuItem
                    className="items-center gap-2 py-1.5"
                    disabled={availability.state === 'unavailable'}
                    key={recent.endpoint}
                    onSelect={() => {
                      if (recent.endpoint !== endpoint) void onConnect(recent);
                    }}
                  >
                    <span className="grid size-4 place-items-center">
                      {recent.endpoint === endpoint ? (
                        <CheckIcon aria-hidden="true" className="text-primary" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">
                        {connectionPlaceLabel(recent.endpoint, recent.label)}
                      </span>
                      <span
                        className="block truncate font-mono text-[11px] text-muted-foreground"
                        title={recent.endpoint}
                      >
                        {recent.endpoint}
                      </span>
                    </span>
                    <ConnectionAvailabilityIndicator
                      availability={availability}
                      compact
                      endpoint={recent.endpoint}
                    />
                  </DropdownMenuItem>
                );
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link state={{ endpoint, from: currentPath }} to="/settings/connections">
                  Manage services
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/?intent=connect">Connect another service</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
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
            <kbd className="ml-auto text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
              Ctrl K
            </kbd>
          </SidebarMenuButton>
        </SidebarMenuItem>
        {attentionControl}
        <SidebarMenuItem className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                aria-label="Create or import"
                className="size-8 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
                tooltip="Create or import"
                type="button"
              >
                <PlusIcon aria-hidden="true" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={onNewSession}>
                <PlusIcon aria-hidden="true" /> New session
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewWorkspace}>
                <FolderGit2Icon aria-hidden="true" /> New workspace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onImportSession}>
                <UploadIcon aria-hidden="true" /> Import session…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onOpenArchived}>
                <ArchiveIcon aria-hidden="true" /> Archived sessions
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
}

function connectionPlaceLabel(endpoint: string, label?: string): string {
  if (label?.trim()) return label.trim();
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return ['127.0.0.1', 'localhost', '::1'].includes(hostname)
      ? 'This device'
      : hostname || 'Remote service';
  } catch {
    return 'Connected service';
  }
}
