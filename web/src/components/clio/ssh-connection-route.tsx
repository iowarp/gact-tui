import { CircleIcon, MapPinIcon, PlusIcon, Settings2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SshHost } from '@/lib/ssh-hosts';
import { ADD_SSH_COMPUTER, SshJumpHostList, SshJumpHostSelect } from './ssh-jump-host-list';

/** Where the shared host dialog should put the computer it saves. */
export type SshRouteStep = { kind: 'destination' } | { kind: 'jump'; index: number | 'new' };

/**
 * Google-Maps-style ordered route editor for jump hosts and the final SSH
 * destination. Every step — destination or jump — is configured through the
 * same host dialog (`onConfigure` / `onCreate`), never a step-specific form.
 */
export function SshConnectionRoute({
  onChange,
  onConfigure,
  onCreate,
  options,
  value,
}: {
  onChange: (host: SshHost | undefined) => void;
  onConfigure: (step: SshRouteStep) => void;
  onCreate: (step: SshRouteStep) => void;
  options: SshHost[];
  value?: SshHost;
}) {
  const [addingJump, setAddingJump] = useState(false);
  const jumps = value?.jumpHosts ?? [];
  const updateJumps = (next: string[]) => {
    if (value) onChange({ ...value, jumpHosts: next });
  };

  return (
    <div aria-label="SSH connection route" className="relative grid gap-2 pl-1">
      {jumps.length || addingJump ? (
        <div aria-hidden="true" className="absolute bottom-8 left-[1.1rem] top-5 w-px bg-border" />
      ) : null}
      <SshJumpHostList
        onChange={updateJumps}
        onConfigure={(index) => onConfigure({ kind: 'jump', index })}
        onCreate={(index) => onCreate({ kind: 'jump', index })}
        options={options}
        value={jumps}
      />

      {addingJump ? (
        <div className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full border bg-background text-muted-foreground">
            <CircleIcon aria-hidden="true" className="size-3 fill-current" />
          </span>
          <SshJumpHostSelect
            onChange={(host) => {
              setAddingJump(false);
              if (host === ADD_SSH_COMPUTER) onCreate({ kind: 'jump', index: 'new' });
              else updateJumps([...jumps, host]);
            }}
            onCreate
            options={options}
            value=""
          />
          <Button
            aria-label="Cancel adding jump host"
            onClick={() => setAddingJump(false)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon aria-hidden="true" />
          </Button>
        </div>
      ) : null}

      <div className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2">
        <span className="grid size-9 place-items-center rounded-full border bg-background text-primary">
          <MapPinIcon aria-hidden="true" className="size-4" />
        </span>
        <Select
          onValueChange={(id) => {
            if (id === ADD_SSH_COMPUTER) {
              onCreate({ kind: 'destination' });
              return;
            }
            onChange(options.find((candidate) => candidate.id === id));
          }}
          value={value?.id ?? ''}
        >
          <SelectTrigger aria-label="Saved SSH host" className="min-w-0">
            <SelectValue placeholder="Choose the destination computer" />
          </SelectTrigger>
          <SelectContent>
            {options.map((candidate) => (
              <SelectItem key={candidate.id} value={candidate.id}>
                {candidate.label}
              </SelectItem>
            ))}
            <SelectItem value={ADD_SSH_COMPUTER}>Add another computer…</SelectItem>
          </SelectContent>
        </Select>
        <Button
          aria-label={value ? `Configure ${value.label}` : 'Add SSH host'}
          onClick={() =>
            value ? onConfigure({ kind: 'destination' }) : onCreate({ kind: 'destination' })
          }
          size="icon"
          type="button"
          variant="ghost"
        >
          <Settings2Icon aria-hidden="true" />
        </Button>
      </div>

      <Button
        className="w-fit justify-start pl-2"
        disabled={!value || addingJump}
        onClick={() => setAddingJump(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon aria-hidden="true" /> Add jump host
      </Button>
    </div>
  );
}
