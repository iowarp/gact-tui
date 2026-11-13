import type { InfrastructureTarget } from '@clio/core/v3';
import { ChevronDownIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IconButton, NamedTooltip } from './primitives/icon-button';
import { DialogSheetHandle } from './primitives/dialog-frame';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useMediaQuery } from '@/hooks/use-media-query';
import { DIALOG_SHEET_CLASS } from '@/lib/dialog-sheet';
import type { SshHost } from '@/lib/ssh-hosts';
import { AddIcon, EditIcon, SettingsIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { AGENT_COMPUTER } from './managed-service-target-utils';
import { SshHostPicker } from './ssh-host-picker';
import { t, ph } from '@lingui/core/macro';

type Computer = Pick<InfrastructureTarget, 'id' | 'label' | 'kind'> &
  Partial<Pick<InfrastructureTarget, 'ssh' | 'transport_state'>>;

const STATUS: Record<
  NonNullable<InfrastructureTarget['transport_state']>,
  { tone: StatusTone; label: string }
> = {
  connected: { tone: 'success', label: t`Connected` },
  reconnecting: { tone: 'running', label: t`Connecting` },
  reauthentication_required: { tone: 'warning', label: t`Sign-in needed` },
  disconnected: { tone: 'idle', label: t`Disconnected` },
  state_unknown: { tone: 'idle', label: t`Not checked` },
};

function computerName(host: Computer) {
  return host.kind === 'local' ? t`This computer` : host.label;
}

/** The muted line under a computer's name: Local, the route through a jump host, or user@host. */
function computerRoute(host: Computer) {
  if (host.kind === 'local') return 'Local';
  const ssh = host.ssh;
  if (!ssh) return '';
  if (ssh.jump_hosts.length) {
    const host = ssh.jump_hosts[ssh.jump_hosts.length - 1];
    return t`via ${host}`;
  }
  if (ssh.host) return ssh.user ? `${ssh.user}@${ssh.host}` : ssh.host;
  return ssh.profile ? t`from ${ph({ profile: ssh.profile })}` : '';
}

function computerStatus(host: Computer) {
  if (host.kind === 'local') return STATUS.connected;
  return STATUS[host.transport_state ?? 'state_unknown'];
}

/**
 * The computer an Infrastructure tab acts on, as one compact control for the
 * tab bar. It opens the spec's Choose a computer picker: search, Local,
 * connected and saved computers with a status word, Add computer, and a
 * Manage computers footer. Under 600 px the picker is a bottom sheet.
 */
export function ManagedServiceHostSelector({
  targets,
  targetId,
  canAdd = false,
  sshHost,
  onSelect,
  onSshHost,
  pending = false,
  error,
}: {
  targets: InfrastructureTarget[];
  targetId: string;
  canAdd?: boolean;
  sshHost?: SshHost;
  onSelect: (id: string) => void;
  onSshHost?: (host: SshHost) => Promise<unknown>;
  pending?: boolean;
  error?: string;
}) {
  const [open, setOpen] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const sheet = useMediaQuery('(max-width: 599px)');
  const navigate = useNavigate();
  const computers: Computer[] = targets.length
    ? targets.filter((host) => host.kind !== 'direct')
    : [{ id: 'local', label: AGENT_COMPUTER, kind: 'local' }];
  const selected = computers.find((host) => host.id === targetId);
  const selectedName = selected ? (selected.kind === 'local' ? 'Local' : selected.label) : targetId;
  const SelectedIcon = selected?.kind === 'local' ? LaptopIcon : ServerIcon;
  const connecting = canAdd && onSshHost !== undefined;
  const startConnect = () => {
    setOpen(false);
    setConnectOpen(true);
  };
  const local = computers.filter((host) => host.kind === 'local');
  const remote = computers.filter((host) => host.kind !== 'local');
  const live = remote.filter((host) => host.transport_state === 'connected');
  const saved = remote.filter((host) => host.transport_state !== 'connected');
  const row = (host: Computer) => {
    const Icon = host.kind === 'local' ? LaptopIcon : ServerIcon;
    const name = computerName(host);
    const route = computerRoute(host);
    const status = computerStatus(host);
    const current = host.id === targetId;
    const editable = current && connecting && sshHost !== undefined && host.kind !== 'local';
    return (
      <CommandItem
        className="group/computer min-h-10 gap-2.5 py-1 data-[checked=true]:bg-primary/10 [&>svg:last-child]:hidden"
        data-checked={current || undefined}
        key={host.id}
        keywords={[name, route]}
        onSelect={() => {
          onSelect(host.id);
          setOpen(false);
        }}
        title={route ? `${name} — ${route}` : name}
        value={host.id}
      >
        <Icon aria-hidden="true" className="size-[15px] text-muted-foreground" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-menu text-foreground">{name}</span>
          {route ? <small className="truncate text-caption text-faint">{route}</small> : null}
        </span>
        <span className="flex w-28 shrink-0 items-center">
          <StatusIndicator label={status.label} tone={status.tone} />
        </span>
        <span className="flex w-7 shrink-0 justify-end">
          {editable ? (
            <IconButton
              className="invisible group-hover/computer:visible group-data-[selected=true]/computer:visible"
              label={t`Edit connection`}
              icon={<EditIcon />}
              onClick={(event) => {
                event.stopPropagation();
                startConnect();
              }}
              onPointerDown={(event) => event.stopPropagation()}
              size="sm"
            />
          ) : null}
        </span>
      </CommandItem>
    );
  };
  const group = (heading: string, hosts: Computer[]) =>
    hosts.length ? <CommandGroup heading={heading}>{hosts.map(row)}</CommandGroup> : null;
  const addReason = inTauri()
    ? t`Needs a ${ph({ agent: vocab.agent })} this app manages`
    : t`In the desktop app`;
  const body: ReactNode = (
    <Command
      className="bg-transparent"
      filter={(value, search, keywords) =>
        [value, ...(keywords ?? [])].join(' ').toLowerCase().includes(search.trim().toLowerCase())
          ? 1
          : 0
      }
      label={t`Choose a computer`}
    >
      <CommandInput flush placeholder={t`Choose a computer`} />
      <CommandList className="max-h-[min(22rem,60dvh)]">
        <CommandEmpty>{t`No computer matches`}</CommandEmpty>
        {group(t`Local`, local)}
        {group(t`Connected ${ph({ agent: vocab.agent })}`, live)}
        {group(t`Saved computers`, saved)}
        <div aria-hidden="true" className="mx-1 my-1.5 h-px bg-border" />
        <CommandGroup>
          <CommandItem
            className="gap-2.5 text-menu [&>svg:last-child]:hidden"
            disabled={!connecting}
            keywords={[t`Add computer`]}
            onSelect={startConnect}
            value="add-computer"
          >
            <AddIcon aria-hidden="true" className="size-[15px] text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate">{t`Add computer`}</span>
            {connecting ? null : (
              <small className="shrink-0 text-caption text-faint">{addReason}</small>
            )}
          </CommandItem>
        </CommandGroup>
      </CommandList>
      <button
        className="flex h-9 w-full items-center gap-2 border-t border-border px-3 text-left text-meta text-muted-foreground hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
        onClick={() => {
          setOpen(false);
          void navigate('/infrastructure/agent');
        }}
        title={t`Manage computers`}
        type="button"
      >
        <SettingsIcon aria-hidden="true" className="size-[15px]" />
        {t`Manage computers`}
      </button>
    </Command>
  );
  const trigger = (
    <Button
      aria-label={t`Computer: ${selectedName}`}
      className="h-7 w-[132px] min-w-[52px] shrink justify-start gap-1.5 px-2 text-meta font-normal @max-[600px]/infra-page:w-auto @max-[600px]/infra-page:max-w-24"
      onClick={sheet ? () => setOpen(true) : undefined}
      size="sm"
      variant="outline"
    >
      <SelectedIcon
        aria-hidden="true"
        className="size-3.5 text-muted-foreground @max-[600px]/infra-page:hidden"
      />
      <span className="min-w-0 flex-1 truncate text-left">{selectedName}</span>
      <ChevronDownIcon aria-hidden="true" className="size-3 text-muted-foreground" />
    </Button>
  );
  return (
    <>
      {sheet ? (
        <>
          <NamedTooltip label={t`Choose a computer`}>{trigger}</NamedTooltip>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent
              className={cn('gap-0 overflow-hidden p-0', DIALOG_SHEET_CLASS)}
              showCloseButton={false}
            >
              <DialogTitle className="sr-only">{t`Choose a computer`}</DialogTitle>
              <DialogDescription className="sr-only">
                {t`Where this tab's services and models run.`}
              </DialogDescription>
              <DialogSheetHandle className="mt-2" />
              {body}
            </DialogContent>
          </Dialog>
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <NamedTooltip label={t`Choose a computer`}>
            <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          </NamedTooltip>
          <PopoverContent
            align="end"
            className="w-[max(300px,22vw)] max-w-[calc(100vw-1rem)] gap-0 overflow-hidden p-0"
          >
            {body}
          </PopoverContent>
        </Popover>
      )}
      {canAdd && onSshHost ? (
        <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
          <ComputerConnectionContent
            sshHost={sshHost}
            pending={pending}
            error={error}
            onConnect={onSshHost}
            onClose={() => setConnectOpen(false)}
          />
        </Dialog>
      ) : null}
    </>
  );
}
/** The same saved-host picker and error recovery for Hosts, Services and Models. */
export function ComputerConnectionContent({
  sshHost,
  pending,
  error,
  onConnect,
  onClose,
}: {
  sshHost?: SshHost;
  pending: boolean;
  error?: string;
  onConnect: (host: SshHost) => Promise<unknown>;
  onClose: () => void;
}) {
  const [candidate, setCandidate] = useState(sshHost);
  const connect = (host: SshHost) => {
    setCandidate(host);
    void onConnect(host).then(onClose, () => undefined);
  };
  return (
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t`Connect a computer`}</DialogTitle>
        <DialogDescription>
          {t`Choose where to run services. Your ${ph({ agent: vocab.agent })} stays connected.`}
        </DialogDescription>
      </DialogHeader>
      <SshHostPicker
        disabled={pending}
        value={sshHost}
        onChange={(host, route) => {
          if (!host || route.emptyRows.length) return;
          connect(host);
        }}
      />
      {pending ? <p role="status">{t`Connecting...`}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {error && candidate ? (
          <Button disabled={pending} onClick={() => connect(candidate)}>
            {t`Retry connection`}
          </Button>
        ) : null}
        <Button className="w-fit" variant="ghost" onClick={onClose}>
          {pending ? t`Close` : t`Cancel`}
        </Button>
      </div>
    </DialogContent>
  );
}
