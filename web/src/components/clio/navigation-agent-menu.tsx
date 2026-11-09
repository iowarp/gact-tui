import { brand } from '@brand';
import type { StreamState } from '@clio/core/v3';
import { ChevronDownIcon } from 'lucide-react';
import { MenuRow } from '@/components/clio/primitives/menu-row';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import type { ConnectionAvailabilityMap } from '@/hooks/use-connection-availability';
import type { ConnectionSettings } from '@/lib/connection';
import { RefreshIcon } from '@/lib/icon-vocabulary';
import { releaseTag } from '@/lib/release-version';
import { cn } from '@/lib/utils';
import { useLiveStore } from '@/store/live-store';
import { BrandIcon } from './brand-icon';
import { ClioMenuContent } from './clio-menu';
import { connectionAgentName, connectionLocation } from './connection-names';
import { useSystemVersionStatus } from '@/hooks/use-system-version-status';
import { ProductUpdateIcon } from './product-update-summary';

interface NavigationAgentMenuProps {
  endpoint: string;
  activeLabel?: string;
  activeLocation?: string;
  currentPath: string;
  connectionAvailabilities: ConnectionAvailabilityMap;
  connections: readonly ConnectionSettings[];
  onConnect: (connection: ConnectionSettings) => void | Promise<void>;
}

/**
 * The left bar's one header button: the mark, the product name and the line
 * under it that names the agent you're talking to and where it runs. It turns
 * amber or red, in words, while reconnecting, offline or with an update ready.
 * The menu is the shared CLIO menu, with the stream error, the update state
 * and Check again added under its version grid.
 */
export function NavigationAgentMenu({
  endpoint,
  activeLabel,
  activeLocation,
  currentPath,
  connectionAvailabilities,
  connections,
  onConnect,
}: NavigationAgentMenuProps) {
  const stream = useConnectionIndicatorState();
  const streamError = useLiveStore((state) => (state.streamOwners > 0 ? state.error : undefined));
  const versions = useSystemVersionStatus();
  const location = connectionLocation(endpoint, activeLocation);
  const name = connectionAgentName(activeLabel, location);
  const place = placeWords(location);
  const line = statusLine(stream, versions.state === 'available', name, place);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void versions.recheck();
      }}
    >
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          aria-label={`${brand.name}: ${line.text}`}
          className="h-11 min-w-0 flex-1 gap-2.5 px-1.5"
          data-connection-state={stream}
          size="lg"
          tooltip={`${brand.name}: ${line.text}`}
        >
          <BrandIcon className="size-[26px]! shrink-0 text-primary" />
          <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-heading text-[15px] font-semibold">
                {brand.wordmark}
              </span>
              <ChevronDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
            </span>
            <span
              className={cn(
                'flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground',
                line.className,
              )}
            >
              <StatusIndicator
                className="-ml-1 size-3"
                display="column"
                label={line.label}
                tone={line.tone}
              />
              <span className="truncate">{line.text}</span>
            </span>
          </span>
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
        versionActions={
          <>
            {streamError ? (
              <p className="truncate px-2 pb-1 text-[12px] text-destructive" title={streamError}>
                {streamError}
              </p>
            ) : null}
            <DropdownMenuItem
              aria-label={versions.statusLabel}
              disabled={versions.updating}
              onSelect={(event) => {
                event.preventDefault();
                if (versions.desktopShell && versions.state === 'available') versions.updateAll();
                else void versions.recheck();
              }}
              title={versions.message}
            >
              <MenuRow
                description={versions.message}
                icon={<ProductUpdateIcon state={versions.state} />}
                label={versionStateWord(versions.state)}
                tag={{
                  text:
                    versions.desktopShell && versions.state === 'available'
                      ? 'Update'
                      : 'Check again',
                  tone: 'info',
                }}
              />
            </DropdownMenuItem>
            {!versions.desktopShell &&
            versions.agentBehindLatest &&
            brand.agentReleaseUrl &&
            versions.latestClioVersion ? (
              <DropdownMenuItem asChild>
                <a
                  href={`${brand.agentReleaseUrl}/tag/${releaseTag(versions.latestClioVersion)}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MenuRow
                    description="Install it on that computer, then reload"
                    icon={<RefreshIcon />}
                    label="View release"
                  />
                </a>
              </DropdownMenuItem>
            ) : null}
          </>
        }
      />
    </DropdownMenu>
  );
}

interface StatusLine {
  text: string;
  label: string;
  tone: StatusTone;
  className?: string;
}

function statusLine(
  stream: StreamState,
  updateReady: boolean,
  name: string,
  place: string,
): StatusLine {
  if (stream === 'offline') {
    return {
      text: `Can't reach ${name}, retrying`,
      label: 'Offline',
      tone: 'error',
      className: 'text-destructive',
    };
  }
  if (stream === 'reconnecting' || stream === 'gapped') {
    return {
      text: 'Resuming updates',
      label: 'Reconnecting',
      tone: 'warning',
      className: 'text-warning-foreground dark:text-warning',
    };
  }
  if (stream === 'connecting') {
    return { text: `Connecting to ${name}`, label: 'Connecting', tone: 'running' };
  }
  if (updateReady) {
    return { text: `${name}, update ready`, label: 'Update ready', tone: 'info' };
  }
  return { text: `${name} @ ${place}`, label: 'Live', tone: 'success' };
}

function versionStateWord(state: ReturnType<typeof useSystemVersionStatus>['state']): string {
  return {
    unknown: 'Not checked yet',
    checking: 'Checking versions',
    current: 'Up to date',
    available: 'Update available',
    unavailable: 'Could not check',
    error: 'Needs attention',
  }[state];
}

function placeWords(location: string): string {
  return location === 'Local' ? 'this computer' : location;
}
