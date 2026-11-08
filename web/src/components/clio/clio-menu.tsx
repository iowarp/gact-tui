import { brand } from '@brand';
import { DownloadIcon, Link2Icon, ServerIcon, TerminalSquareIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { KeyValueGrid } from '@/components/clio/primitives/key-value-grid';
import { MenuKeyHints } from '@/components/clio/primitives/menu-key-hints';
import { MenuRow } from '@/components/clio/primitives/menu-row';
import { Tag, type TagTone } from '@/components/clio/primitives/tag';
import { useRuntimeVersion } from '@/hooks/use-runtime-version';
import {
  connectionAvailability,
  type ConnectionAvailability,
  type ConnectionAvailabilityMap,
} from '@/hooks/use-connection-availability';
import type { ConnectionSettings } from '@/lib/connection';
import { AddIcon, ConfigureIcon } from '@/lib/icon-vocabulary';
import { displayReleaseVersion } from '@/lib/release-version';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { AgentConnectionIdentity } from './agent-connection-identity';
import { connectionDisplayName } from './connection-names';

interface ClioMenuContentProps {
  endpoint: string;
  activeLabel?: string;
  activeLocation?: string;
  currentPath: string;
  connectionAvailabilities: ConnectionAvailabilityMap;
  connections: readonly ConnectionSettings[];
  onConnect: (connection: ConnectionSettings) => void | Promise<void>;
}

const MENU_HINTS = [
  { id: 'menu-move', label: 'move' },
  { id: 'menu-pick', label: 'switch' },
  { id: 'menu-submenu', label: 'open' },
] as const;

/** A short state word that fits the 58px tag column; the full sentence is on hover. */
function availabilityTag(
  availability: ConnectionAvailability,
  active: boolean,
): { text: string; tone: TagTone } {
  switch (availability.state) {
    case 'healthy':
      return { text: active ? 'Live' : 'Online', tone: 'success' };
    case 'degraded':
      return { text: 'Limited', tone: 'warning' };
    case 'unavailable':
      return { text: 'Offline', tone: 'neutral' };
    default:
      return { text: 'Checking', tone: 'info' };
  }
}

function webBuildVersion(): string | undefined {
  const stamped: unknown = import.meta.env.VITE_CLIO_WORKSPACE_VERSION;
  return displayReleaseVersion(typeof stamped === 'string' ? stamped : undefined);
}

/**
 * The CLIO menu: who the interface is talking to, how to reach its
 * settings, the other saved agents, the ways to add one, and Infrastructure.
 */
export function ClioMenuContent({
  endpoint,
  activeLabel,
  activeLocation,
  currentPath,
  connectionAvailabilities,
  connections,
  onConnect,
}: ClioMenuContentProps) {
  const runtime = useRuntimeVersion();
  const desktop = inTauri();
  const active = connectionAvailability(connectionAvailabilities, endpoint);
  const activeTag = availabilityTag(active, true);
  const others = connections.filter((connection) => connection.endpoint !== endpoint);
  const returnState = { endpoint, from: currentPath };

  return (
    <DropdownMenuContent align="start" className="w-[22rem] p-0">
      <div className="p-[5px]">
        <DropdownMenuLabel>Talking to</DropdownMenuLabel>
        <div className="flex h-8 min-w-0 items-center gap-2 px-2 text-sm">
          <span className="min-w-0 flex-1 truncate">
            <AgentConnectionIdentity
              endpoint={endpoint}
              label={activeLabel}
              location={activeLocation}
            />
          </span>
          <Tag title={`${active.label}: ${active.detail}`} tone={activeTag.tone}>
            {activeTag.text}
          </Tag>
        </div>
        <KeyValueGrid
          className="px-2 pb-1.5"
          items={[
            { label: 'Address', value: endpoint, mono: true },
            { label: 'Transport', value: desktop ? 'Bridge' : 'Direct' },
            { label: 'Interface version', value: webBuildVersion() ?? 'Unknown', mono: true },
            {
              label: 'Runtime version',
              value: runtime.version ?? (runtime.pending ? 'Checking' : 'Unknown'),
              mono: true,
            },
          ]}
        />
        <DropdownMenuItem asChild>
          <Link state={returnState} to="/settings/connections">
            <MenuRow icon={<ConfigureIcon />} label="Connection settings" />
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <div className="flex items-center justify-between gap-2 pr-1">
          <DropdownMenuLabel>Switch to</DropdownMenuLabel>
          <DropdownMenuItem
            asChild
            className="h-6 min-h-0 px-1.5 text-[11px] text-muted-foreground"
          >
            <Link to="/?intent=connect">Manage agents</Link>
          </DropdownMenuItem>
        </div>
        {others.length ? (
          others.map((connection) => {
            const availability = connectionAvailability(
              connectionAvailabilities,
              connection.endpoint,
            );
            const tag = availabilityTag(availability, false);
            return (
              <DropdownMenuItem
                disabled={availability.state === 'unavailable'}
                key={connection.endpoint}
                onSelect={() => void onConnect(connection)}
                title={`${availability.label}: ${availability.detail}`}
              >
                <MenuRow
                  description={connection.endpoint}
                  label={connectionDisplayName(
                    connection.endpoint,
                    connection.label,
                    connection.location,
                  )}
                  tag={tag}
                />
              </DropdownMenuItem>
            );
          })
        ) : (
          <p className="truncate px-2 py-1.5 text-[12px] text-muted-foreground">
            No other saved agents
          </p>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MenuRow icon={<AddIcon />} label="Add an agent…" />
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-[22rem]">
            <DropdownMenuItem asChild>
              <Link to="/?intent=connect&mode=address">
                <MenuRow
                  description={`A ${brand.agentName} that is already running`}
                  icon={<Link2Icon />}
                  label="Connect by address"
                />
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild disabled={!desktop}>
              <Link to="/?intent=connect&mode=deploy">
                <MenuRow
                  description={desktop ? 'A saved host, or add one' : 'In the desktop app'}
                  icon={<TerminalSquareIcon />}
                  label="Connect over SSH"
                />
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild disabled={!desktop}>
              <Link to="/?intent=connect&mode=deploy">
                <MenuRow
                  description={desktop ? 'Set it up over SSH, then connect' : 'In the desktop app'}
                  icon={<DownloadIcon />}
                  label={`Install ${brand.agentName} on a computer`}
                />
              </Link>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link state={returnState} to="/infrastructure">
            <MenuRow icon={<ServerIcon />} label="Infrastructure" shortcut="infrastructure" />
          </Link>
        </DropdownMenuItem>
      </div>
      <MenuKeyHints hints={MENU_HINTS} />
    </DropdownMenuContent>
  );
}
