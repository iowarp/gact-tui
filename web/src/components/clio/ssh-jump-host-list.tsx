import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CheckIcon, GripVerticalIcon, MapPinIcon, Settings2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Sortable, SortableItem, SortableItemHandle } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { SshHost } from '@/lib/ssh-hosts';
import { jumpHostError, reconcileJumpSteps, type JumpStep } from './ssh-route-utils';

export const ADD_SSH_COMPUTER = '__add-ssh-computer__';
export const TYPE_SSH_ADDRESS = '__type-ssh-address__';

/**
 * The one ordered hop editor, shared by the front-door route and the host
 * dialog's own nested proxy chain: reorder by drag or keyboard, pick a saved
 * computer per step, remove a step, and (where the caller supports it) open
 * the same host configuration dialog every step uses.
 *
 * With `lastIsDestination`, the last step is the route's destination rather
 * than another jump host: it gets its own icon and label, and empty rows are
 * real rows — a hop can be added before any computer is chosen, and each row
 * is filled in (picked, typed, or configured) on its own. Without it, this is
 * a plain jump chain — the shape a saved computer's own proxy chain needs.
 */
export function SshJumpHostList({
  disabled = false,
  lastIsDestination = false,
  onChange,
  onConfigure,
  onCreate,
  options,
  value,
}: {
  disabled?: boolean;
  /** The last step is the destination, not another jump host. */
  lastIsDestination?: boolean;
  onChange: (hosts: string[]) => void;
  /** Opens the shared host dialog for the step; omitted inside the dialog itself. */
  onConfigure?: (index: number) => void;
  /** Offers "Add another computer…" in each step's picker. */
  onCreate?: (index: number) => void;
  options: SshHost[];
  value: string[];
}) {
  const [steps, setSteps] = useState<JumpStep[]>(() => reconcileJumpSteps([], value));
  const [typingKey, setTypingKey] = useState<string>();
  // A route changed from outside (a saved step, another editor) re-attaches the
  // identities this list already has, so rows keep their drag identity.
  if (!sameHosts(steps, value)) setSteps(reconcileJumpSteps(steps, value));
  if (!value.length) return null;

  const commit = (next: JumpStep[]) => {
    setSteps(next);
    const hosts = next.map((step) => step.host);
    // Route rows may stay empty until filled in; a plain chain has no blanks.
    onChange(lastIsDestination ? hosts : hosts.filter((host) => host !== ''));
  };
  const setHost = (index: number, host: string) =>
    commit(steps.map((item, itemIndex) => (itemIndex === index ? { ...item, host } : item)));


  return (
    <Sortable
      aria-label={
        lastIsDestination
          ? 'SSH connection route hops, in order'
          : 'Jump hosts, in connection order'
      }
      className="grid gap-2"
      role="list"
      getItemValue={(step) => step.key}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      onValueChange={commit}
      strategy="vertical"
      value={steps}
    >
      {steps.map((step, index) => {
        const isDestinationRow = lastIsDestination && index === steps.length - 1;
        // A route never visits the same computer twice: each row offers the
        // computers no other row uses. A plain chain keeps every option.
        const taken = lastIsDestination
          ? steps.filter((_, row) => row !== index).map((row) => row.host)
          : [];
        const rowOptions = options.filter((option) => !taken.includes(option.profile ?? ''));
        const stepLabel = step.host
          ? (options.find((option) => option.profile === step.host)?.label ?? step.host)
          : undefined;
        return (
          <SortableItem
            // The row is a list item; only its grip is the drag control.
            aria-describedby={undefined}
            aria-pressed={undefined}
            aria-roledescription={undefined}
            className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg bg-background"
            disabled={disabled}
            key={step.key}
            role="listitem"
            tabIndex={-1}
            value={step.key}
          >
            <SortableItemHandle asChild>
              <Button
                aria-label={
                  isDestinationRow ? 'Reorder destination' : `Reorder jump host ${index + 1}`
                }
                className={cn(
                  'rounded-full border',
                  isDestinationRow ? 'text-primary' : 'text-muted-foreground',
                )}
                disabled={disabled}
                size="icon-lg"
                title={isDestinationRow ? 'Destination (drag to reorder)' : 'Drag to reorder'}
                type="button"
                variant="outline"
              >
                {isDestinationRow ? (
                  <MapPinIcon aria-hidden="true" />
                ) : (
                  <GripVerticalIcon aria-hidden="true" />
                )}
              </Button>
            </SortableItemHandle>
            {typingKey === step.key ? (
              <SshJumpAddressField
                onCancel={() => setTypingKey(undefined)}
                onSubmit={(destination) => {
                  setTypingKey(undefined);
                  setHost(index, destination);
                }}
              />
            ) : (
              <SshJumpHostSelect
                ariaLabel={isDestinationRow ? 'Saved SSH host' : undefined}
                disabled={disabled}
                index={index}
                onChange={(host) => {
                  if (host === ADD_SSH_COMPUTER) {
                    onCreate?.(index);
                    return;
                  }
                  if (host === TYPE_SSH_ADDRESS) {
                    setTypingKey(step.key);
                    return;
                  }
                  setHost(index, host);
                }}
                onCreate={Boolean(onCreate)}
                onTypeAddress={lastIsDestination}
                options={rowOptions}
                placeholder={isDestinationRow ? 'Choose the destination computer' : undefined}
                value={step.host}
              />
            )}
            <div className="flex items-center gap-1">
              {onConfigure ? (
                <Button
                  aria-label={
                    stepLabel
                      ? `Configure ${stepLabel}`
                      : isDestinationRow
                        ? 'Add SSH host'
                        : `Configure jump host ${index + 1}`
                  }
                  disabled={disabled}
                  onClick={() => onConfigure(index)}
                  size="icon"
                  title={stepLabel ? `Configure ${stepLabel}` : 'Configure a new computer'}
                  type="button"
                  variant="ghost"
                >
                  <Settings2Icon aria-hidden="true" />
                </Button>
              ) : null}
              <Button
                aria-label={
                  isDestinationRow ? 'Remove destination' : `Remove jump host ${index + 1}`
                }
                disabled={disabled}
                onClick={() => commit(steps.filter((_, itemIndex) => itemIndex !== index))}
                size="icon"
                title="Remove"
                type="button"
                variant="ghost"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </div>
          </SortableItem>
        );
      })}
    </Sortable>
  );
}

function sameHosts(steps: readonly JumpStep[], hosts: readonly string[]): boolean {
  return steps.length === hosts.length && steps.every((step, index) => step.host === hosts[index]);
}

/** A saved-computer picker for one hop; an unsaved OpenSSH destination stays visible. */
export function SshJumpHostSelect({
  ariaLabel,
  disabled = false,
  index,
  onChange,
  onCreate,
  onTypeAddress,
  options,
  placeholder,
  value,
}: {
  /** Overrides the default "Jump host N" label, for a route hop's own wording. */
  ariaLabel?: string;
  disabled?: boolean;
  index?: number;
  onChange: (value: string) => void;
  onCreate: boolean;
  /** Offers typing an OpenSSH alias or address that is not a saved computer. */
  onTypeAddress?: boolean;
  options: SshHost[];
  /** Overrides the default "Choose a saved computer" placeholder. */
  placeholder?: string;
  value: string;
}) {
  const jumpOptions = options.filter((option) => option.profile);
  const known = jumpOptions.some((option) => option.profile === value);
  return (
    <Select disabled={disabled} onValueChange={onChange} value={known ? value : ''}>
      <SelectTrigger
        aria-label={ariaLabel ?? (index === undefined ? 'New jump host' : `Jump host ${index + 1}`)}
        className="min-w-0"
      >
        <SelectValue placeholder={value || placeholder || 'Choose a saved computer'} />
      </SelectTrigger>
      <SelectContent>
        {jumpOptions.map((option) => (
          <SelectItem key={option.id} value={option.profile ?? option.id}>
            {option.label}
          </SelectItem>
        ))}
        {onTypeAddress ? (
          <SelectItem value={TYPE_SSH_ADDRESS}>Type an OpenSSH alias or address…</SelectItem>
        ) : null}
        {onCreate ? <SelectItem value={ADD_SSH_COMPUTER}>Add another computer…</SelectItem> : null}
      </SelectContent>
    </Select>
  );
}

/**
 * A jump step typed as an OpenSSH alias or `user@host[:port]`, for hosts that
 * are not saved computers (for example ones matched only by a `Host` pattern
 * in the user's own OpenSSH configuration).
 */
export function SshJumpAddressField({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (destination: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const error = jumpHostError(draft.trim());
  const submit = () => {
    if (draft.trim() && !error) onSubmit(draft.trim());
  };
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex min-w-0 items-center gap-1">
        <Input
          aria-describedby={error ? 'ssh-jump-address-error' : undefined}
          aria-invalid={Boolean(error)}
          aria-label="Jump host alias or address"
          autoFocus
          className="min-w-0"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
            if (event.key === 'Escape') onCancel();
          }}
          placeholder="gateway or alice@gateway.example.edu:2222"
          value={draft}
        />
        <Button
          aria-label="Use this jump host"
          disabled={!draft.trim() || Boolean(error)}
          onClick={submit}
          size="icon"
          type="button"
          variant="ghost"
        >
          <CheckIcon aria-hidden="true" />
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive" id="ssh-jump-address-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
