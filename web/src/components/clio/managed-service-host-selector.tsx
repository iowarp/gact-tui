import type { InfrastructureTarget } from '@clio/core/v3';
import { ChevronDownIcon, LaptopIcon, ServerIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NamedTooltip } from './primitives/icon-button';
import { MenuRow } from './primitives/menu-row';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { SshHost } from '@/lib/ssh-hosts';
import { AddIcon, EditIcon } from '@/lib/icon-vocabulary';
import { vocab } from '@/lib/brand-vocabulary';
import { SshHostPicker } from './ssh-host-picker';

/**
 * The computer an Infrastructure tab acts on, as one compact control for the
 * tab bar. Saved computers switch in one click; connecting or editing a
 * computer opens the shared connection dialog.
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
  const computers = targets.length
    ? targets.filter((host) => host.kind !== 'direct')
    : [{ id: 'local', label: `This ${vocab.agent}'s computer`, kind: 'local' }];
  const name = (host: { kind: string; label: string }) =>
    host.kind === 'local' ? 'Local' : host.label;
  const selected = computers.find((host) => host.id === targetId);
  const selectedName = selected ? name(selected) : targetId;
  const SelectedIcon = selected?.kind === 'local' ? LaptopIcon : ServerIcon;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DropdownMenu modal={false}>
        <NamedTooltip label="Choose a computer">
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Computer: ${selectedName}`}
              className="h-7 w-[132px] justify-start gap-1.5 px-2 text-[12px] font-normal"
              size="sm"
              variant="outline"
            >
              <SelectedIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-left">{selectedName}</span>
              <ChevronDownIcon aria-hidden="true" className="size-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
        </NamedTooltip>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="text-[11.5px] text-muted-foreground">
            Choose a computer
          </DropdownMenuLabel>
          {computers.map((host) => {
            const Icon = host.kind === 'local' ? LaptopIcon : ServerIcon;
            return (
              <DropdownMenuItem key={host.id} onSelect={() => onSelect(host.id)}>
                <MenuRow checked={host.id === targetId} icon={<Icon />} label={name(host)} />
              </DropdownMenuItem>
            );
          })}
          {canAdd && onSshHost ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setOpen(true)}>
                <MenuRow icon={<AddIcon />} label="Add computer" />
              </DropdownMenuItem>
              {sshHost ? (
                <DropdownMenuItem onSelect={() => setOpen(true)}>
                  <MenuRow icon={<EditIcon />} label="Edit connection" />
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {canAdd && onSshHost ? (
        <ComputerConnectionContent
          sshHost={sshHost}
          pending={pending}
          error={error}
          onConnect={onSshHost}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </Dialog>
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
        <DialogTitle>Connect a computer</DialogTitle>
        <DialogDescription>
          Choose where to run services. Your {vocab.agent} stays connected.
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
      {pending ? <p role="status">Connecting...</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        {error && candidate ? (
          <Button disabled={pending} onClick={() => connect(candidate)}>
            Retry connection
          </Button>
        ) : null}
        <Button className="w-fit" variant="ghost" onClick={onClose}>
          {pending ? 'Close' : 'Cancel'}
        </Button>
      </div>
    </DialogContent>
  );
}
