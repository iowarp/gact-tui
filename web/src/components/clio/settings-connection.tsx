import { useMutation } from '@tanstack/react-query';
import { CopyIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { IconButton, NamedTooltip } from '@/components/clio/primitives/icon-button';
import { ItemList, ItemRow } from '@/components/clio/primitives/item-row';
import { JumpLabel, menuAcceleratorKeyDown } from '@/components/clio/primitives/menu-row';
import { SaveBar } from '@/components/clio/primitives/save-bar';
import { StatusIndicator, type StatusTone } from '@/components/clio/primitives/status-indicator';
import { SettingsGroupLabel, SettingsRow } from '@/components/clio/settings-row';
import { SettingsSectionHeading } from '@/components/clio/settings-section-heading';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { ConnectionAvailability } from '@/hooks/use-connection-availability';
import { useKnownConnections, type KnownConnection } from '@/hooks/use-known-connections';
import { useSwitchConnection } from '@/hooks/use-switch-connection';
import { vocab } from '@/lib/brand-vocabulary';
import { AFTER_DIALOG, announce } from '@/lib/announce';
import { copyText } from '@/lib/clipboard';
import { normalizeEndpoint, type ConnectionSettings } from '@/lib/connection';
import { DeleteIcon, EditIcon, ManageIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { isLoopbackAddress } from '@/lib/local-servers';
import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { agentAvailabilityLabel } from './connection-names';
import { rowArrowKeyDown } from '@/lib/row-arrow-keys';
import {
  AddAgentDialog,
  RemoveAgentDialog,
  RenameAgentDialog,
} from './settings-connection-dialogs';
import {
  CONNECTION_FIELD,
  connectionTransport,
  endpointError,
  interfaceVersion,
  useConnectionRuntime,
} from './settings-connection-runtime';

const SELECT_TRIGGER =
  'w-[150px] min-w-0 px-[9px] text-menu data-[size=default]:h-[1.875rem] data-[size=default]:rounded-md';

const TRANSPORTS = [
  { value: 'Direct', detail: 'A browser talks to the agent over HTTP.' },
  { value: 'Bridge', detail: 'The desktop app carries every request.' },
  { value: 'SSH', detail: 'Reached through an Infrastructure route.' },
] as const;

const AVAILABILITY: Record<ConnectionAvailability['state'], { label: string; tone: StatusTone }> = {
  healthy: { label: 'Online', tone: 'success' },
  degraded: { label: 'Limited', tone: 'warning' },
  unavailable: { label: 'Offline', tone: 'idle' },
  checking: { label: 'Checking', tone: 'running' },
};

function hostOf(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/** A saved label, or the agent's name; the address stays on the meta line. */
function connectionName(connection: { label?: string }): string {
  return connection.label?.trim() || vocab.agent;
}

/** Where this app talks to the agent, its versions, and the other agents to switch to. */
export function ConnectionsSettings() {
  const navigate = useNavigate();
  const { settings, forget, rename, readOnly } = useConnectionSettings();
  const knownConnections = useKnownConnections();
  const switchConnection = useSwitchConnection();
  const runtime = useConnectionRuntime();
  const [address, setAddress] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<KnownConnection>();
  const [removing, setRemoving] = useState<KnownConnection>();
  const connectionSwitch = useMutation({
    mutationFn: (connection: ConnectionSettings) =>
      switchConnection(connection, { navigateToWorkspace: false }),
    onSuccess: (_, connection) =>
      announce(`Switched to ${connection.label?.trim() || hostOf(connection.endpoint)}`),
  });

  const draft = address ?? settings.endpoint;
  const addressDirty = address !== undefined && address.trim() !== settings.endpoint;
  const addressError = addressDirty ? endpointError(draft) : undefined;
  const others = knownConnections.filter((connection) => connection.endpoint !== settings.endpoint);
  const transport = connectionTransport(Boolean(settings.infrastructure?.route));
  const pendingEndpoint = connectionSwitch.isPending
    ? connectionSwitch.variables?.endpoint
    : undefined;

  const saveAddress = () => {
    if (addressError) return;
    connectionSwitch.mutate(
      { endpoint: normalizeEndpoint(draft.trim()) },
      { onSuccess: () => setAddress(undefined) },
    );
  };
  const manageAgents = () => void navigate('/?intent=connect');

  return (
    <div>
      <SettingsSectionHeading
        title="Connection"
        info={`Where this app reaches ${vocab.agent}. It reconnects to the last address when it opens.`}
      />
      <SettingsRow
        title="Address"
        htmlFor="connection-address"
        dirty={addressDirty}
        error={addressError}
      >
        <Input
          aria-invalid={Boolean(addressError) || undefined}
          autoCapitalize="off"
          autoCorrect="off"
          className={cn(CONNECTION_FIELD, 'font-mono text-ellipsis')}
          disabled={readOnly || connectionSwitch.isPending}
          id="connection-address"
          inputMode="url"
          onChange={(event) => setAddress(event.target.value)}
          spellCheck={false}
          title={draft}
          value={draft}
        />
      </SettingsRow>
      <SettingsRow
        title="Transport"
        htmlFor="connection-transport"
        info="How the app reaches the agent. Set by where the app runs: Direct in a browser, Bridge in the desktop app, SSH for an Infrastructure route."
      >
        <Select value={transport}>
          <SelectTrigger className={SELECT_TRIGGER} id="connection-transport">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {TRANSPORTS.map((option) => (
              <SelectItem
                disabled={option.value !== transport}
                key={option.value}
                title={option.detail}
                value={option.value}
              >
                {option.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow title="Interface">
        <span className="font-mono text-menu font-medium">
          {interfaceVersion() ? `v${interfaceVersion()}` : 'Unknown'}
        </span>
      </SettingsRow>
      <SettingsRow
        title="Runtime"
        error={runtime.unreachable ? `${vocab.agent} did not answer.` : undefined}
      >
        <span className="min-w-0 truncate text-xs" title={runtime.status.detail}>
          <StatusIndicator label={runtime.status.label} tone={runtime.status.tone} />
        </span>
        {runtime.version ? (
          <span className="mr-1 ml-0.5 font-mono text-menu font-medium">
            v{runtime.version}
          </span>
        ) : null}
        {runtime.unreachable ? (
          <Button
            className="h-auto shrink-0 p-0 text-xs"
            disabled={runtime.checking}
            onClick={runtime.recheck}
            size="xs"
            variant="link"
          >
            {runtime.checking ? 'Retrying' : 'Retry'}
          </Button>
        ) : (
          <Button disabled={runtime.checking} onClick={runtime.recheck} size="sm" variant="outline">
            Check again
          </Button>
        )}
      </SettingsRow>
      {runtime.degradations.length ? (
        <SettingsRow
          title="Unavailable features"
          info="What this agent cannot do on this connection."
        >
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline">
                {runtime.degradations.length === 1
                  ? '1 feature'
                  : `${runtime.degradations.length} features`}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              aria-label="Not available on this agent"
              className="w-72 max-w-(--radix-popover-content-available-width) p-0 text-xs"
              collisionPadding={16}
            >
              <p className="px-3 pt-2.5 pb-1.5 font-medium text-foreground">
                Not available on this agent
              </p>
              <ul className="grid pb-1.5">
                {runtime.degradations.map((feature) => (
                  <li
                    className="truncate px-3 py-1 text-muted-foreground"
                    key={feature}
                    title={feature}
                  >
                    {feature}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </SettingsRow>
      ) : null}

      <div className={cn('w-full', SETTINGS_COLUMN)} data-row-keys="" onKeyDown={rowArrowKeyDown}>
        <SettingsGroupLabel
          actions={
            <IconButton
              icon={<ManageIcon />}
              label="Manage agents…"
              onClick={manageAgents}
              size="sm"
            />
          }
          addLabel="Add an agent…"
          onAdd={readOnly ? undefined : () => setAdding(true)}
        >
          Switch to
        </SettingsGroupLabel>
        <ItemList label="Agents to switch to">
          {others.map((connection) => {
            const name = connectionName(connection);
            const host = hostOf(connection.endpoint);
            const availability = AVAILABILITY[connection.availability.state];
            const local = connection.source === 'managed' || isLoopbackAddress(connection.endpoint);
            const pending = pendingEndpoint === connection.endpoint;
            return (
              <ItemRow
                actions={
                  <>
                    <IconButton
                      icon={<EditIcon />}
                      label={`Rename ${name}`}
                      onClick={() => setRenaming(connection)}
                      size="sm"
                    />
                    {connection.source === 'recent' ? (
                      <IconButton
                        icon={<DeleteIcon />}
                        label={`Remove ${name}`}
                        onClick={() => setRemoving(connection)}
                        size="sm"
                      />
                    ) : null}
                    <DropdownMenu modal={false}>
                      <NamedTooltip label={`More for ${name}`}>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            icon={<MoreIcon />}
                            label={`More for ${name}`}
                            size="sm"
                            tooltip={false}
                          />
                        </DropdownMenuTrigger>
                      </NamedTooltip>
                      <DropdownMenuContent
                        align="end"
                        className="min-w-48"
                        onKeyDown={menuAcceleratorKeyDown}
                      >
                        <DropdownMenuItem
                          data-accelerator="C"
                          onSelect={() =>
                            void copyText(connection.endpoint).then(
                              () => toast.success('Address copied'),
                              () => toast.error('Could not copy the address'),
                            )
                          }
                        >
                          <CopyIcon aria-hidden="true" />
                          <JumpLabel label="Copy address" letter="C" />
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem data-accelerator="M" onSelect={manageAgents}>
                          <ManageIcon aria-hidden="true" />
                          <JumpLabel label="Manage agents…" letter="M" />
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                }
                icon={
                  local ? (
                    <LaptopIcon className="size-[0.9375rem]" />
                  ) : (
                    <ServerIcon className="size-[0.9375rem]" />
                  )
                }
                key={connection.endpoint}
                meta={
                  <span className="font-mono" title={connection.endpoint}>
                    {host}
                  </span>
                }
                slot={
                  <Button
                    aria-label={`Switch to ${name}`}
                    disabled={
                      readOnly ||
                      connectionSwitch.isPending ||
                      connection.availability.state === 'unavailable'
                    }
                    onClick={() =>
                      connectionSwitch.mutate({
                        endpoint: connection.endpoint,
                        label: connection.label,
                        location: connection.location,
                        infrastructure: connection.infrastructure,
                        token: connection.token,
                      })
                    }
                    size="sm"
                    title={
                      connection.availability.state === 'unavailable'
                        ? `${name} is offline`
                        : undefined
                    }
                    variant="outline"
                  >
                    {pending ? 'Switching…' : 'Switch'}
                  </Button>
                }
                status={
                  <span
                    className="min-w-0 truncate text-xs"
                    title={`${agentAvailabilityLabel(connection.availability, false)}: ${connection.availability.detail}`}
                  >
                    <StatusIndicator label={availability.label} tone={availability.tone} />
                  </span>
                }
                title={<span title={name}>{name}</span>}
              />
            );
          })}
          {others.length === 0 ? (
            <p className="flex h-11 items-center border-b border-border/70 px-2 text-xs text-muted-foreground">
              No other agents saved. Add one to switch between them.
            </p>
          ) : null}
        </ItemList>
        {connectionSwitch.error && !addressDirty && connectionSwitch.variables ? (
          <p
            className="mt-2 flex min-w-0 items-center gap-2 text-xs whitespace-nowrap"
            role="alert"
          >
            <span className="min-w-0 truncate text-destructive">
              Could not switch. That agent did not answer.
            </span>
            <Button
              className="h-auto shrink-0 p-0 text-xs"
              disabled={connectionSwitch.isPending}
              onClick={() => connectionSwitch.mutate(connectionSwitch.variables!)}
              size="xs"
              variant="link"
            >
              Retry
            </Button>
          </p>
        ) : null}
      </div>

      <SaveBar
        count={addressDirty ? 1 : 0}
        invalid={Boolean(addressError)}
        error={
          addressDirty && connectionSwitch.error
            ? 'Could not switch. Nothing answered at this address.'
            : undefined
        }
        label="New address, saving switches to it"
        onDiscard={() => setAddress(undefined)}
        onSave={saveAddress}
        saving={connectionSwitch.isPending && addressDirty}
      />
      <AddAgentDialog
        known={knownConnections}
        onAdd={(connection, name) => {
          rename(connection, name);
          announce(`Added ${name.trim()}`, AFTER_DIALOG);
        }}
        onOpenChange={setAdding}
        open={adding}
      />
      <RenameAgentDialog
        connection={renaming}
        known={knownConnections}
        onOpenChange={(open) => {
          if (!open) setRenaming(undefined);
        }}
        onRename={(name) => {
          if (!renaming) return;
          rename(renaming, name);
          announce(`Renamed to ${name.trim()}`, AFTER_DIALOG);
        }}
      />
      <RemoveAgentDialog
        connection={
          removing ? { endpoint: removing.endpoint, name: connectionName(removing) } : undefined
        }
        onOpenChange={(open) => {
          if (!open) setRemoving(undefined);
        }}
        onRemove={() => {
          if (!removing) return;
          void forget(removing.endpoint);
          announce(`Removed ${connectionName(removing)}`, AFTER_DIALOG);
        }}
      />
    </div>
  );
}
