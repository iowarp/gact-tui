import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { GripVerticalIcon, Settings2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { SshHost } from '@/lib/ssh-hosts';
import { reconcileJumpSteps, type JumpStep } from './ssh-route-utils';

export const ADD_SSH_COMPUTER = '__add-ssh-computer__';

/**
 * The one ordered jump-host editor, shared by the front-door route and the
 * host dialog: reorder by drag or keyboard, pick a saved computer per step,
 * remove a step, and (where the caller supports it) open the same host
 * configuration dialog the destination uses.
 */
export function SshJumpHostList({
  onChange,
  onConfigure,
  onCreate,
  options,
  value,
}: {
  onChange: (hosts: string[]) => void;
  /** Opens the shared host dialog for the step; omitted inside the dialog itself. */
  onConfigure?: (index: number) => void;
  /** Offers "Add another computer…" in each step's picker. */
  onCreate?: (index: number) => void;
  options: SshHost[];
  value: string[];
}) {
  const [steps, setSteps] = useState<JumpStep[]>(() => reconcileJumpSteps([], value));
  // A route changed from outside (a saved step, another editor) re-attaches the
  // identities this list already has, so rows keep their drag identity.
  if (!sameHosts(steps, value)) setSteps(reconcileJumpSteps(steps, value));
  if (!value.length) return null;

  const commit = (next: JumpStep[]) => {
    setSteps(next);
    onChange(next.map((step) => step.host));
  };

  return (
    <Sortable
      className="grid gap-2"
      getItemValue={(step) => step.key}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onValueChange={commit}
      strategy="vertical"
      value={steps}
    >
      {steps.map((step, index) => (
        <SortableItem
          className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-background"
          key={step.key}
          value={step.key}
        >
          <SortableItemHandle asChild>
            <Button
              aria-label={`Reorder jump host ${index + 1}`}
              className="rounded-full border text-muted-foreground"
              size="icon-lg"
              type="button"
              variant="outline"
            >
              <GripVerticalIcon aria-hidden="true" />
            </Button>
          </SortableItemHandle>
          <SshJumpHostSelect
            index={index}
            onChange={(host) => {
              if (host === ADD_SSH_COMPUTER) {
                onCreate?.(index);
                return;
              }
              commit(steps.map((item, itemIndex) => (itemIndex === index ? { ...item, host } : item)));
            }}
            onCreate={Boolean(onCreate)}
            options={options}
            value={step.host}
          />
          <div className="flex items-center gap-1">
            {onConfigure ? (
              <Button
                aria-label={`Configure jump host ${index + 1}`}
                onClick={() => onConfigure(index)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Settings2Icon aria-hidden="true" />
              </Button>
            ) : null}
            <Button
              aria-label={`Remove jump host ${index + 1}`}
              onClick={() => commit(steps.filter((_, itemIndex) => itemIndex !== index))}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </SortableItem>
      ))}
    </Sortable>
  );
}

function sameHosts(steps: readonly JumpStep[], hosts: readonly string[]): boolean {
  return steps.length === hosts.length && steps.every((step, index) => step.host === hosts[index]);
}

/** A saved-computer picker for one jump step; an unsaved OpenSSH destination stays visible. */
export function SshJumpHostSelect({
  index,
  onChange,
  onCreate,
  options,
  value,
}: {
  index?: number;
  onChange: (value: string) => void;
  onCreate: boolean;
  options: SshHost[];
  value: string;
}) {
  const jumpOptions = options.filter((option) => option.profile);
  const known = jumpOptions.some((option) => option.profile === value);
  return (
    <Select onValueChange={onChange} value={known ? value : ''}>
      <SelectTrigger
        aria-label={index === undefined ? 'New jump host' : `Jump host ${index + 1}`}
        className="min-w-0"
      >
        <SelectValue placeholder={value || 'Choose a saved computer'} />
      </SelectTrigger>
      <SelectContent>
        {jumpOptions.map((option) => (
          <SelectItem key={option.id} value={option.profile ?? option.id}>
            {option.label}
          </SelectItem>
        ))}
        {onCreate ? <SelectItem value={ADD_SSH_COMPUTER}>Add another computer…</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}
