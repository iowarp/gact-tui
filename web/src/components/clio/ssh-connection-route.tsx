import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SshHost } from '@/lib/ssh-hosts';
import { SshJumpHostList } from './ssh-jump-host-list';

/** Which hop the shared host dialog should configure, or create a new computer into. */
export type SshRouteStep = { index: number; isDestination: boolean };

/**
 * Google-Maps-style ordered route editor for SSH hops. The route is one
 * sortable list of rows; the last row is the destination, and every row —
 * including the destination and rows not filled in yet — can be reordered,
 * picked, typed, or configured through the shared host dialog. "Add hop"
 * appends an empty row at any time, so the common case (pick the login node,
 * then add the compute node the job was given after it) needs no ordering
 * tricks. Empty rows are allowed here; the deploy action validates them.
 */
export function SshConnectionRoute({
  disabled = false,
  onConfigure,
  onCreate,
  onSlotsChange,
  options,
  slots,
}: {
  disabled?: boolean;
  onConfigure: (step: SshRouteStep) => void;
  onCreate: (step: SshRouteStep) => void;
  onSlotsChange: (slots: string[]) => void;
  options: SshHost[];
  /** Hop references in connection order, `''` for a row not filled in yet. */
  slots: string[];
}) {
  const step = (index: number) => ({ index, isDestination: index === slots.length - 1 });
  return (
    <div aria-label="SSH connection route" className="relative grid gap-2 pl-1">
      {slots.length > 1 ? (
        <div aria-hidden="true" className="absolute bottom-12 left-[1.1rem] top-5 w-px bg-border" />
      ) : null}

      <SshJumpHostList
        disabled={disabled}
        lastIsDestination
        onChange={onSlotsChange}
        onConfigure={(index) => onConfigure(step(index))}
        onCreate={(index) => onCreate(step(index))}
        options={options}
        value={slots}
      />

      <Button
        className="w-fit justify-start pl-2"
        disabled={disabled}
        onClick={() => onSlotsChange([...slots, ''])}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon aria-hidden="true" /> Add hop
      </Button>
    </div>
  );
}
