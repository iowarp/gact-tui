import { brand } from '@brand';
import { withArticle } from '@/lib/brand-vocabulary';
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  CopyIcon,
  DownloadIcon,
  GlobeIcon,
  LaptopIcon,
  LayersIcon,
  Link2Icon,
  LoaderCircleIcon,
  PlugIcon,
  RocketIcon,
  SearchIcon,
  ServerIcon,
  TerminalSquareIcon,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
import { NamedTooltip } from '@/components/clio/primitives/icon-button';
import { KeyValueGrid, type KeyValueItem } from '@/components/clio/primitives/key-value-grid';
import { MenuKeyHints } from '@/components/clio/primitives/menu-key-hints';
import { MenuRow } from '@/components/clio/primitives/menu-row';
import { ShortcutKeys } from '@/components/clio/primitives/key-chip';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useRuntimeVersion } from '@/hooks/use-runtime-version';
import { useUpdateStatus, type UpdateStatus } from '@/hooks/use-update-status';
import {
  connectionAvailability,
  type ConnectionAvailability,
  type ConnectionAvailabilityMap,
} from '@/hooks/use-connection-availability';
import { copyText } from '@/lib/clipboard';
import type { ConnectionSettings } from '@/lib/connection';
import { AddIcon, ConnectionSettingsIcon, RefreshIcon } from '@/lib/icon-vocabulary';
import { displayReleaseVersion } from '@/lib/release-version';
import { useShortcutPresentation } from '@/lib/shortcuts/hooks';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import {
  AGENT_AVAILABILITY_TONE,
  agentAvailabilityLabel,
  agentIdentity,
  type AgentIdentity,
} from './connection-names';

interface ClioMenuContentProps {
  endpoint: string;
  activeLabel?: string;
  activeLocation?: string;
  currentPath: string;
  connectionAvailabilities: ConnectionAvailabilityMap;
  connections: readonly ConnectionSettings[];
  onConnect: (connection: ConnectionSettings) => void | Promise<void>;
  /** Where focus goes on close when the menu has no visible trigger to return to. */
  onCloseAutoFocus?: (event: Event) => void;
}

const MENU_HINTS = [
  { id: 'menu-move', label: 'move' },
  { id: 'menu-pick', label: 'switch' },
  { id: 'menu-open', label: 'open' },
] as const;

/** Drilled into Add an agent at narrow widths: Enter chooses a way, Left goes back. */
const ADD_HINTS = [
  { id: 'menu-move', label: 'move' },
  { id: 'menu-pick', label: 'choose' },
  { id: 'menu-back', label: 'back' },
] as const;

/** A short state word for the 62px status column; the full sentence is on hover. */
function availabilityStatus(
  availability: ConnectionAvailability,
  active: boolean,
): { label: string; tone: StatusTone } {
  const tone = AGENT_AVAILABILITY_TONE[availability.state];
  switch (availability.state) {
    case 'healthy':
    case 'unavailable':
      return { label: agentAvailabilityLabel(availability, active), tone };
    case 'degraded':
      return { label: 'Limited', tone };
    default:
      return { label: 'Checking', tone };
  }
}

const KIND_ICON: Record<AgentIdentity['kind'], ReactNode> = {
  local: <LaptopIcon />,
  ip: <ServerIcon />,
  host: <GlobeIcon />,
};

function webBuildVersion(): string | undefined {
  const stamped: unknown = import.meta.env.VITE_CLIO_WORKSPACE_VERSION;
  return displayReleaseVersion(typeof stamped === 'string' ? stamped : undefined);
}

/** Group label: the spec's 11px semibold heading with 9px above it. */
const GROUP_LABEL = 'pt-[9px] pb-[3px] font-semibold';
/** The facts' columns: label 46%, value right-aligned, a 22px action. */
const FACT_COLUMNS = 'grid-cols-[46%_minmax(0,1fr)_22px] gap-x-2.5';
const FACT_GRID = cn(FACT_COLUMNS, 'auto-rows-[25px] gap-y-0');
/** A fact row that is also a menu item: the same columns and height as the facts. */
const FACT_ITEM = cn(
  "-mx-1.5 grid min-h-[25px] rounded-[5px] px-1.5 py-0 text-[12px] [&_svg:not([class*='size-'])]:size-[13px]",
  FACT_COLUMNS,
);
/** A fact row's action column: one 22px icon at the row's end. */
const FACT_ACTION = '-mr-1 grid size-[22px] place-items-center justify-self-end';
const FACT_LABEL = 'flex min-w-0 items-center gap-2';
const FACT_VALUE = 'min-w-0 truncate text-right font-mono text-[11.5px] text-foreground/85';

function addressOf(endpoint: string): string {
  try {
    return new URL(endpoint).host || endpoint;
  } catch {
    return endpoint;
  }
}

function focusFirstItem(from: HTMLElement) {
  from
    .closest('[role="menu"]')
    ?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')
    ?.focus();
}

/**
 * A saved agent to switch to: its name, address and state. Shared by the CLIO
 * menu and the desktop title bar's Agent menu.
 */
export function SwitchAgentItem({
  availability,
  connection,
  onConnect,
}: {
  availability: ConnectionAvailability;
  connection: ConnectionSettings;
  onConnect: (connection: ConnectionSettings) => void | Promise<void>;
}) {
  const saved = agentIdentity(connection.endpoint, connection.label, connection.location);
  const unavailable = availability.state === 'unavailable';
  return (
    <DropdownMenuItem
      className="min-h-[30px] py-[3px] text-[12.5px] data-disabled:opacity-100 [&_svg:not([class*='size-'])]:size-[15px]"
      disabled={unavailable}
      onSelect={() => void onConnect(connection)}
      title={`${connection.endpoint}. ${agentAvailabilityLabel(availability, false)}: ${availability.detail}`}
    >
      <MenuRow
        className="gap-[9px]"
        detail={saved.address}
        icon={KIND_ICON[saved.kind]}
        label={saved.name}
        muted={unavailable}
        status={availabilityStatus(availability, false)}
      />
    </DropdownMenuItem>
  );
}

/**
 * The CLIO menu: who the interface is talking to and its details, the other
 * saved agents, the ways to add one, and the way to Infrastructure.
 */
export function ClioMenuContent({
  endpoint,
  activeLabel,
  activeLocation,
  currentPath,
  connectionAvailabilities,
  connections,
  onConnect,
  onCloseAutoFocus,
}: ClioMenuContentProps) {
  const runtime = useRuntimeVersion();
  const update = useUpdateStatus(runtime.version);
  const desktop = inTauri();
  const [query, setQuery] = useState('');
  // Below 600px the submenu has no room beside the menu, so it opens in place.
  const narrow = useMediaQuery('(max-width: 599px)');
  const [adding, setAdding] = useState(false);
  const backRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const wasAdding = useRef(false);
  useEffect(() => {
    // Keyboard focus follows the drill-in: onto Back, then back to Add an agent.
    if (adding) backRef.current?.focus();
    else if (wasAdding.current) addRef.current?.focus();
    wasAdding.current = adding;
  }, [adding]);
  const searchRef = useRef<HTMLInputElement>(null);
  const identity = agentIdentity(endpoint, activeLabel, activeLocation);
  const active = connectionAvailability(connectionAvailabilities, endpoint);
  const activeStatus = availabilityStatus(active, true);
  const returnState = { endpoint, from: currentPath };
  const interfaceVersion = webBuildVersion();
  const needle = query.trim().toLowerCase();
  const others = connections
    .filter((connection) => connection.endpoint !== endpoint)
    .map((connection) => ({
      connection,
      saved: agentIdentity(connection.endpoint, connection.label, connection.location),
    }))
    .filter(
      ({ saved }) => !needle || `${saved.name} ${saved.address}`.toLowerCase().includes(needle),
    );
  const facts: KeyValueItem[] = [
    { label: 'Transport', icon: <PlugIcon />, value: desktop ? 'Bridge' : 'Direct', mono: true },
    ...(interfaceVersion
      ? [
          {
            label: 'Interface version',
            icon: <LayersIcon />,
            value: `v${interfaceVersion}`,
            mono: true,
          },
        ]
      : []),
    ...(runtime.version
      ? [
          {
            label: 'Runtime version',
            icon: <ServerIcon />,
            value: `v${runtime.version}`,
            mono: true,
          },
        ]
      : []),
  ];

  return (
    <DropdownMenuContent
      align="start"
      // Below 600px the picker is a bottom sheet (connect-infrastructure "Picker").
      className={cn(
        'w-[340px] p-0',
        narrow &&
          'max-h-[85dvh] w-full max-w-full rounded-t-[14px] rounded-b-none data-open:zoom-in-100',
      )}
      data-picker-sheet={narrow ? '' : undefined}
      onCloseAutoFocus={(event) => {
        setQuery('');
        setAdding(false);
        onCloseAutoFocus?.(event);
      }}
      onKeyDownCapture={(event) => {
        // Typing anywhere in the menu searches the agents instead of jumping by first letter.
        const search = searchRef.current;
        if (!search || event.target === search) return;
        if (event.key.length !== 1 || event.key === ' ') return;
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.stopPropagation();
        search.focus();
      }}
    >
      {narrow ? (
        <div aria-hidden="true" className="mx-auto mt-2 mb-1 h-1 w-9 rounded-full bg-border" />
      ) : null}
      {!adding ? (
        <label className="flex h-9 min-w-0 items-center gap-2 border-b border-border px-3.5 text-muted-foreground">
          <SearchIcon aria-hidden="true" className="size-[15px] shrink-0" />
          <input
            aria-label="Search agents"
            className="h-full min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                focusFirstItem(event.currentTarget);
              } else if (event.key !== 'Escape' && event.key !== 'Tab') {
                event.stopPropagation();
              }
            }}
            placeholder="Search agents"
            ref={searchRef}
            type="search"
            value={query}
          />
          {desktop ? null : <ShortcutKeys id="app-menu" variant="caps" />}
        </label>
      ) : null}
      {adding ? (
        <div className="p-1.5 text-[12.5px]">
          <DropdownMenuItem
            className="min-h-[30px] py-[3px] text-[12.5px]"
            onSelect={(event) => {
              event.preventDefault();
              setAdding(false);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft') return;
              event.preventDefault();
              setAdding(false);
            }}
            ref={backRef}
          >
            <MenuRow className="gap-[9px]" icon={<ArrowLeftIcon />} label="Add an agent" />
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1.5" />
          <AddAgentItems desktop={desktop} />
        </div>
      ) : (
        <div className="p-1.5 text-[12.5px]">
          <DropdownMenuLabel className={GROUP_LABEL}>Talking to</DropdownMenuLabel>
          <div
            className="flex min-h-[30px] min-w-0 items-center gap-[9px] rounded-[5px] bg-accent px-2 py-[3px] text-accent-foreground"
            title={`${active.label}: ${active.detail}`}
          >
            <span aria-hidden="true" className="shrink-0 [&_svg]:size-[15px]">
              {KIND_ICON[identity.kind]}
            </span>
            <span className="flex min-w-0 flex-1 flex-col leading-[1.3]">
              <span className="truncate font-medium">{identity.name}</span>
              <span className="truncate text-[11px] text-accent-foreground">{identity.place}</span>
            </span>
            <span className="mr-[34px] flex min-w-[62px] shrink-0">
              <StatusIndicator
                className="text-[11px] text-accent-foreground"
                label={activeStatus.label}
                tone={activeStatus.tone}
              />
            </span>
          </div>
          <div className="mr-2 mb-1 ml-[15px] border-l border-border py-0.5 pl-4">
            <AddressFact address={addressOf(endpoint)} />
            <KeyValueGrid actionColumn className={FACT_GRID} items={facts} />
            {update ? <UpdateFact update={update} /> : null}
            <DropdownMenuItem asChild className={cn(FACT_ITEM, 'text-link')}>
              <Link state={returnState} to="/settings/connections">
                <span className={cn(FACT_LABEL, 'col-span-2')}>
                  <ConnectionSettingsIcon aria-hidden="true" />
                  <span className="truncate">Connection settings</span>
                </span>
                <span aria-hidden="true" className={cn(FACT_ACTION, 'text-muted-foreground')}>
                  <ChevronRightIcon />
                </span>
              </Link>
            </DropdownMenuItem>
          </div>
          <DropdownMenuSeparator className="my-1.5" />
          <div className="flex min-w-0 items-center justify-between gap-2">
            <DropdownMenuLabel className={GROUP_LABEL}>Switch to</DropdownMenuLabel>
            <DropdownMenuItem
              asChild
              className="mt-1.5 h-6 min-h-0 gap-[5px] px-2 text-[11px] font-medium text-link [&_svg:not([class*='size-'])]:size-[13px]"
            >
              <Link to="/?intent=connect">
                <LayersIcon aria-hidden="true" />
                Manage agents
              </Link>
            </DropdownMenuItem>
          </div>
          {others.length ? (
            others.map(({ connection }) => (
              <SwitchAgentItem
                availability={connectionAvailability(connectionAvailabilities, connection.endpoint)}
                connection={connection}
                key={connection.endpoint}
                onConnect={onConnect}
              />
            ))
          ) : (
            <p className="truncate px-2 py-1.5 text-[12px] text-muted-foreground">
              {needle ? 'No saved agent matches' : 'No other saved agents'}
            </p>
          )}
          <DropdownMenuSeparator className="my-1.5" />
          {narrow ? (
            <DropdownMenuItem
              className="min-h-[30px] text-[12.5px] text-link"
              onSelect={(event) => {
                event.preventDefault();
                setAdding(true);
              }}
              onKeyDown={(event) => {
                // The same key as the submenu it stands in for.
                if (event.key !== 'ArrowRight') return;
                event.preventDefault();
                setAdding(true);
              }}
              ref={addRef}
            >
              <MenuRow
                className="gap-[9px]"
                icon={<AddIcon className="text-link" />}
                label="Add an agent…"
                submenu
              />
            </DropdownMenuItem>
          ) : (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="min-h-[30px] text-[12.5px] text-link">
                <MenuRow
                  className="gap-[9px]"
                  icon={<AddIcon className="text-link" />}
                  label="Add an agent…"
                />
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                className="w-[292px] text-[12.5px] [&_[data-slot=menu-row]_[title]]:text-muted-foreground!"
                alignOffset={-7}
                sideOffset={12}
              >
                <AddAgentItems desktop={desktop} />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
        </div>
      )}
      <div className="flex items-center border-t border-border/70 pr-1">
        <MenuKeyHints
          className="min-w-0 flex-1 border-t-0 pl-3.5"
          hints={adding ? ADD_HINTS : MENU_HINTS}
          keysFirst
        />
        <InfrastructureItem returnState={returnState} />
      </div>
    </DropdownMenuContent>
  );
}

/** The three ways to add an agent: the submenu's rows, or the narrow menu's drill-in. */
function AddAgentItems({ desktop }: { desktop: boolean }) {
  return (
    <>
      <DropdownMenuItem asChild className="min-h-[30px] py-[3px] text-[12.5px]">
        <Link to="/?intent=connect&mode=address">
          <MenuRow
            className="gap-[9px]"
            detail={`${withArticle(brand.agentName)} that is already running`}
            icon={<GlobeIcon />}
            label="Connect by address"
          />
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="min-h-[30px] py-[3px] text-[12.5px]" disabled={!desktop}>
        <Link to="/?intent=connect&mode=deploy">
          <MenuRow
            className="gap-[9px]"
            detail={desktop ? 'A saved host, or add one' : 'In the desktop app'}
            icon={<TerminalSquareIcon />}
            label="Connect over SSH"
          />
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="min-h-[30px] py-[3px] text-[12.5px]" disabled={!desktop}>
        <Link to="/?intent=connect&mode=deploy">
          <MenuRow
            className="gap-[9px]"
            detail={desktop ? 'Set it up over SSH, then connect' : 'In the desktop app'}
            icon={<RocketIcon />}
            label={`Install ${brand.agentName} on a computer`}
          />
        </Link>
      </DropdownMenuItem>
    </>
  );
}

/**
 * The Address fact: the agent's host and port without the scheme. Choosing
 * the row copies the full address; the menu stays open to show it worked.
 */
function AddressFact({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <DropdownMenuItem
      aria-label={copied ? `Address ${address}. Copied` : `Address ${address}. Copy`}
      className={FACT_ITEM}
      onSelect={(event) => {
        event.preventDefault();
        void copyText(address).then(() => setCopied(true));
      }}
      title={address}
    >
      <span className={cn(FACT_LABEL, 'text-muted-foreground')}>
        <Link2Icon aria-hidden="true" />
        <span className="truncate">Address</span>
      </span>
      <span className={FACT_VALUE}>{address}</span>
      <span aria-hidden="true" className={cn(FACT_ACTION, 'text-muted-foreground')}>
        {copied ? <CheckIcon className="text-link" /> : <CopyIcon />}
      </span>
    </DropdownMenuItem>
  );
}

/** The footer's Infrastructure icon: one menu item, named on hover with its key. */
function InfrastructureItem({ returnState }: { returnState: { endpoint: string; from: string } }) {
  const shortcut = useShortcutPresentation('infrastructure');
  return (
    <NamedTooltip label="Infrastructure" shortcut="infrastructure" side="top">
      <DropdownMenuItem
        asChild
        className="size-6 min-h-0 justify-center rounded-[5px] p-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5"
      >
        <Link
          aria-keyshortcuts={shortcut?.aria}
          aria-label="Infrastructure"
          state={returnState}
          to="/infrastructure"
        >
          <ServerIcon aria-hidden="true" />
        </Link>
      </DropdownMenuItem>
    </NamedTooltip>
  );
}

const UPDATE_LABEL: Record<UpdateStatus['state'], string> = {
  unknown: 'Not checked yet',
  checking: 'Checking for updates',
  current: 'Up to date',
  available: 'Update available',
  error: 'Could not check',
  updating: 'Updating',
};

/**
 * The Up to date fact. The row is one menu item: choosing it checks again,
 * or installs a found update where this interface can install it. The menu
 * stays open so the answer shows in place.
 */
function UpdateFact({ update }: { update: UpdateStatus }) {
  const busy = update.state === 'checking' || update.state === 'updating';
  const installable = update.state === 'available' && update.install;
  const label =
    update.state === 'available' && update.targetVersion
      ? `v${update.targetVersion} ${update.install ? 'ready' : 'available'}`
      : UPDATE_LABEL[update.state];
  const action = installable ? 'Install' : update.state === 'unknown' ? 'Check now' : 'Check again';
  const icon =
    update.state === 'current' ? (
      <CheckIcon className="text-link" />
    ) : update.state === 'available' ? (
      <DownloadIcon className="text-warning" />
    ) : update.state === 'error' ? (
      <CircleAlertIcon className="text-muted-foreground" />
    ) : busy ? (
      <LoaderCircleIcon className="text-muted-foreground motion-safe:animate-spin" />
    ) : (
      <RefreshIcon className="text-muted-foreground" />
    );
  return (
    <DropdownMenuItem
      aria-label={busy ? label : `${label}. ${action}`}
      className={FACT_ITEM}
      disabled={busy}
      onSelect={(event) => {
        event.preventDefault();
        if (installable) update.install?.();
        else update.check();
      }}
      title={update.message}
    >
      <span
        className={cn(
          FACT_LABEL,
          update.state === 'available' ? 'text-warning' : 'text-muted-foreground',
        )}
      >
        <span aria-hidden="true" className="grid shrink-0 place-items-center">
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="min-w-0 truncate text-right text-link">{busy ? null : action}</span>
      <span aria-hidden="true" className={cn(FACT_ACTION, 'text-muted-foreground')}>
        {busy ? null : installable ? <DownloadIcon /> : <RefreshIcon />}
      </span>
    </DropdownMenuItem>
  );
}
