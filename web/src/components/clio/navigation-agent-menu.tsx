import { brand } from '@brand';
import type { StreamState } from '@clio/core/v3';
import { ChevronsUpDownIcon } from 'lucide-react';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { useState } from 'react';
import { DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useConnectionIndicatorState } from '@/hooks/use-connection-indicator-state';
import type { ConnectionAvailabilityMap } from '@/hooks/use-connection-availability';
import type { ConnectionSettings } from '@/lib/connection';
import { useClioMenuRequest } from '@/lib/clio-menu-request';
import { settingsWindowOpen } from '@/lib/settings-window-route';
import { useShortcut } from '@/lib/shortcuts/hooks';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { useLiveStore } from '@/store/live-store';
import { BrandIcon } from './brand-icon';
import { ClioMenuContent } from './clio-menu';
import { connectionAgentName, connectionLocation } from './connection-names';
import { useSystemVersionStatus } from '@/hooks/use-system-version-status';

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
 * The menu is the shared CLIO menu; a stream error is named in the tooltip.
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
  const agentName = connectionAgentName(activeLabel, location);
  // An unnamed agent reads as the product and its place: "CLIO local @ this computer".
  // A longer wordmark already heads the menu, so the line names the agent
  // instead ("Agent, this computer") and fits beside the bell.
  const shortMark = brand.wordmark.length <= 6;
  const name =
    agentName !== connectionAgentName(undefined, location) || !shortMark
      ? agentName
      : location === 'Local'
        ? `${brand.wordmark} local`
        : brand.wordmark;
  const place = placeWords(location);
  const line = statusLine(stream, versions.state === 'available', name, place);
  const tooltip = `${brand.name}: ${line.text}${streamError ? `. ${streamError}` : ''}`;
  const [menuOpen, setMenuOpen] = useState(false);
  // In a browser Alt Space opens the CLIO menu; Desktop keeps it for its window menu.
  // Under the Settings window the window's own CLIO menu takes the key and requests.
  const uncovered = () => !settingsWindowOpen();
  useShortcut('app-menu', () => setMenuOpen(true), { enabled: !inTauri(), when: uncovered });
  useClioMenuRequest(() => setMenuOpen(true), uncovered);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) void versions.recheck();
      }}
      open={menuOpen}
    >
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton
          aria-label={`${brand.name}: ${line.text}`}
          className="h-11 min-w-0 flex-1 gap-2.5 px-1.5"
          data-connection-state={stream}
          size="lg"
          tooltip={tooltip}
        >
          <span className="relative grid shrink-0 place-items-center">
            <BrandIcon className="size-[26px]! shrink-0 text-primary" />
            {line.tone === 'error' || line.tone === 'warning' || line.tone === 'running' ? (
              // Folded to icons the status line is hidden; its shaped glyph stays on the mark.
              <StatusIndicator
                className="absolute -right-[3px] -bottom-[3px] hidden size-3 rounded-full bg-sidebar group-data-[collapsible=icon]:inline-grid [&>*]:size-3!"
                display="column"
                label={line.text}
                mark="glyph"
                tone={line.tone}
              />
            ) : null}
          </span>
          <span className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-heading text-[15px] font-semibold">
                {brand.wordmark}
              </span>
              <ChevronsUpDownIcon aria-hidden="true" className="size-3.5 shrink-0 text-faint" />
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
              {line.parts ? (
                <span className={cn('flex min-w-0', line.at ? 'gap-1' : 'gap-2')}>
                  <span className="shrink-0">{line.parts[0]}</span>
                  {line.at ? (
                    <span aria-hidden="true" className="shrink-0 text-faint">
                      @
                    </span>
                  ) : null}
                  <span className="truncate" data-full-text={line.text}>
                    {line.parts[1]}
                  </span>
                </span>
              ) : (
                <span className="truncate">{line.text}</span>
              )}
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
        live={stream === 'live'}
        onConnect={onConnect}
      />
    </DropdownMenu>
  );
}

interface StatusLine {
  text: string;
  /** Shown as two phrases split by a layout gap instead of a comma. */
  parts?: readonly [string, string];
  /** Joins the parts with a faint @: the agent, then where it runs. */
  at?: boolean;
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
    return {
      text: `${name}, update ready`,
      parts: [name, 'update ready'],
      label: 'Update ready',
      tone: 'info',
    };
  }
  return {
    text: `${name}, ${place}`,
    parts: [name, place],
    at: true,
    label: 'Live',
    tone: 'success',
  };
}

function placeWords(location: string): string {
  return location === 'Local' ? 'this computer' : location;
}
