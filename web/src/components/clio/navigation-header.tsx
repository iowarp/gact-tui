import { brand } from '@brand';
import {
  ArchiveIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FolderGit2Icon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ConnectionAvailabilityIndicator } from '@/components/clio/connection-availability';
import { vocab } from '@/lib/brand-vocabulary';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SavedConnection } from '@/lib/connection';
import type { SshTunnelSettings } from '@/tauri/ssh-tunnel';
import {
  connectionAvailability,
  type ConnectionAvailabilityMap,
} from '@/hooks/use-connection-availability';

interface NavigationHeaderProps {
  endpoint: string;
  activeLabel?: string;
  activeTunnel?: SshTunnelSettings;
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
  activeTunnel,
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
  const otherConnections = recentConnections.filter((recent) => recent.endpoint !== endpoint);

  return (
    <SidebarHeader className="gap-2 border-b border-sidebar-border/70 p-2">
      <SidebarMenu className="in-data-[mobile=true]:pr-10">
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                className="h-11"
                size="lg"
                tooltip={`${brand.name}: ${activeAvailability.label}. ${activeAvailability.detail}`}
              >
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
                      tunnel={activeTunnel}
                    />
                  </span>
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-3.5 group-data-[collapsible=icon]:hidden"
                />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-96">
              <DropdownMenuLabel className="space-y-1">
                <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Connected agent
                </span>
                <AgentConnectionIdentity
                  endpoint={endpoint}
                  label={activeLabel}
                  tunnel={activeTunnel}
                />
                <span className="block truncate font-mono text-[11px] font-normal text-muted-foreground">
                  {endpoint}
                </span>
              </DropdownMenuLabel>
              {otherConnections.length ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Other agents
                  </DropdownMenuLabel>
                </>
              ) : null}
              {otherConnections.map((recent) => {
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
                        <AgentConnectionIdentity
                          endpoint={recent.endpoint}
                          label={recent.label}
                          tunnel={recent.tunnel}
                        />
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

function AgentConnectionIdentity({
  endpoint,
  label,
  tunnel,
}: {
  endpoint: string;
  label?: string;
  tunnel?: SshTunnelSettings;
}) {
  const location = connectionLocation(endpoint, label, tunnel);
  const name = connectionAgentName(label, location);
  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <span className="truncate">{location}</span>
      <ChevronRightIcon aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
      <span className="shrink-0 font-medium text-foreground">{name}</span>
    </span>
  );
}

function connectionAgentName(label: string | undefined, location: string): string {
  const trimmed = label?.trim();
  if (!trimmed) return vocab.agent;
  const locationLower = location.toLocaleLowerCase();
  const labelLower = trimmed.toLocaleLowerCase();
  if (
    ['this computer', 'this device', 'local'].includes(labelLower) ||
    labelLower === locationLower
  ) {
    return vocab.agent;
  }
  const prefix = `${locationLower} `;
  if (labelLower.startsWith(prefix)) {
    return trimmed.slice(location.length).trim() || vocab.agent;
  }
  return trimmed;
}

function connectionLocation(endpoint: string, label?: string, tunnel?: SshTunnelSettings): string {
  const tunnelLocation = tunnel?.profile?.trim() || tunnel?.host.trim();
  const namedLocation = cleanConnectionLocation(tunnelLocation || label);
  if (namedLocation) return namedLocation;
  try {
    const hostname = new URL(endpoint).hostname.toLowerCase();
    return ['127.0.0.1', 'localhost', '::1'].includes(hostname) ? 'Local' : hostname || 'Remote';
  } catch {
    return 'Connected';
  }
}

function cleanConnectionLocation(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const lower = trimmed.toLocaleLowerCase();
  if (['this computer', 'this device', 'local'].includes(lower)) return 'Local';
  const agent = vocab.agent.trim();
  const agentLower = agent.toLocaleLowerCase();
  if (lower === agentLower) return undefined;
  if (lower.endsWith(` ${agentLower}`)) {
    return trimmed.slice(0, -(agent.length + 1)).trim() || undefined;
  }
  return tunnelStyleName(trimmed) ?? trimmed;
}

function tunnelStyleName(value: string): string | undefined {
  if (!/^[a-z0-9_-]+$/u.test(value) || /^\d+(?:\.\d+){3}$/u.test(value)) return undefined;
  const words = value.replace(/[_-]+/gu, ' ');
  return words.charAt(0).toLocaleUpperCase() + words.slice(1);
}
