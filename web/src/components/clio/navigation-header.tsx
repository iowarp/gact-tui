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
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { SavedConnection } from '@/lib/connection';

interface NavigationHeaderProps {
  endpoint: string;
  activeLabel?: string;
  currentPath: string;
  recentConnections: readonly SavedConnection[];
  onConnect: (connection: SavedConnection) => void | Promise<void>;
  onNewSession: () => void;
  onNewWorkspace: () => void;
  onImportSession: () => void;
  onOpenArchived: () => void;
}

export function NavigationHeader({
  endpoint,
  activeLabel,
  currentPath,
  recentConnections,
  onConnect,
  onNewSession,
  onNewWorkspace,
  onImportSession,
  onOpenArchived,
}: NavigationHeaderProps) {
  const logoSource =
    brand.logoImage ??
    (brand.logoSvg ? `data:image/svg+xml,${encodeURIComponent(brand.logoSvg)}` : null);

  return (
    <SidebarHeader className="gap-2 border-b border-sidebar-border/70 p-2">
      <SidebarMenu>
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
                  <span className="font-heading font-semibold">{brand.wordmark}</span>
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
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>
                <span className="block">Agent services</span>
                <span
                  className="block truncate text-[11px] font-normal text-muted-foreground"
                  title={endpoint}
                >
                  {connectionTypeLabel(endpoint)}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {recentConnections.map((recent) => (
                <DropdownMenuItem
                  className="items-start gap-2"
                  key={recent.endpoint}
                  onSelect={() => {
                    if (recent.endpoint !== endpoint) void onConnect(recent);
                  }}
                  title={recent.endpoint}
                >
                  <span className="mt-0.5 grid size-4 place-items-center">
                    {recent.endpoint === endpoint ? (
                      <CheckIcon aria-hidden="true" className="size-3.5 text-primary" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm">
                      {connectionPlaceLabel(recent.endpoint, recent.label)}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {connectionTypeLabel(recent.endpoint)}
                    </span>
                  </span>
                </DropdownMenuItem>
              ))}
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
      <div className="flex items-center gap-1 group-data-[collapsible=icon]:flex-col">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label="Search work"
              className="min-w-0 flex-1 justify-start group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:px-0"
              onClick={() => window.dispatchEvent(new Event('clio:open-command-menu'))}
              size="sm"
              type="button"
              variant="ghost"
            >
              <SearchIcon aria-hidden="true" />
              <span className="truncate group-data-[collapsible=icon]:hidden">Search</span>
              <kbd className="ml-auto text-[10px] text-muted-foreground group-data-[collapsible=icon]:hidden">
                Ctrl K
              </kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Search work, files, and actions</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button aria-label="Create or import" size="icon-sm" type="button">
                  <PlusIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>Create or import</TooltipContent>
          </Tooltip>
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
      </div>
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

function connectionTypeLabel(endpoint: string): string {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    if (url.pathname.includes('__clio_remote')) return 'Development tunnel';
    if (['127.0.0.1', 'localhost', '::1'].includes(hostname)) return 'This device';
    if (isPrivateNetworkHost(hostname)) return 'Local network';
    return hostname || 'Remote service';
  } catch {
    return 'Connected service';
  }
}

function isPrivateNetworkHost(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value))) return false;
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && (octets[1] ?? 0) >= 16 && (octets[1] ?? 0) <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    (octets[0] === 100 && (octets[1] ?? 0) >= 64 && (octets[1] ?? 0) <= 127)
  );
}
