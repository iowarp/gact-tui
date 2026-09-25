import { CircleIcon, PlusIcon, Settings2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SshHost } from '@/lib/ssh-hosts';
import {
  ADD_SSH_COMPUTER,
  SshJumpAddressField,
  SshJumpHostList,
  SshJumpHostSelect,
  TYPE_SSH_ADDRESS,
} from './ssh-jump-host-list';
import { applyRouteOrder, resolveRouteHop, routeSteps } from './ssh-route-utils';

/** Which hop the shared host dialog should configure, or create a new computer into. */
export type SshRouteStep = { index: number; isDestination: boolean };

/**
 * Google-Maps-style ordered route editor for SSH hops. The route is one
 * sortable list of hops; any hop, including the destination, can be
 * reordered by drag or keyboard, because the destination is simply the last
 * hop, not a pinned row. Every step — including a brand-new, unsaved one —
 * is configured through the same host dialog (`onConfigure` / `onCreate`).
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
  const [addingHop, setAddingHop] = useState<'choose' | 'type'>();
  const refs = routeSteps(value);
  const destinationRef = refs.length ? refs[refs.length - 1] : undefined;
  // The current destination is never offered again, whether as another hop or a duplicate destination.
  const addOptions = options.filter((option) => option.profile !== destinationRef);
  const resolve = (ref: string) => resolveRouteHop(ref, options);
  const commitRefs = (hosts: string[]) => onChange(applyRouteOrder(hosts, resolve));
  const appendHop = (ref: string) => {
    setAddingHop(undefined);
    commitRefs([...refs, ref]);
  };

  return (
    <div aria-label="SSH connection route" className="relative grid gap-2 pl-1">
      {refs.length > 1 || addingHop ? (
        <div aria-hidden="true" className="absolute bottom-8 left-[1.1rem] top-5 w-px bg-border" />
      ) : null}

      <SshJumpHostList
        lastIsDestination
        onChange={commitRefs}
        onConfigure={(index) => onConfigure({ index, isDestination: isDestinationIndex(index, refs) })}
        onCreate={(index) => onCreate({ index, isDestination: isDestinationIndex(index, refs) })}
        options={options}
        value={refs}
      />

      {addingHop ? (
        <div className="relative z-10 grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-2">
          <span className="grid size-9 place-items-center rounded-full border bg-background text-muted-foreground">
            <CircleIcon aria-hidden="true" className="size-3 fill-current" />
          </span>
          {addingHop === 'type' ? (
            <SshJumpAddressField onCancel={() => setAddingHop(undefined)} onSubmit={appendHop} />
          ) : (
            <SshJumpHostSelect
              onChange={(host) => {
                if (host === TYPE_SSH_ADDRESS) {
                  setAddingHop('type');
                  return;
                }
                if (host === ADD_SSH_COMPUTER) {
                  setAddingHop(undefined);
                  onCreate({ index: refs.length, isDestination: true });
                  return;
                }
                appendHop(host);
              }}
              onCreate
              onTypeAddress
              options={addOptions}
              placeholder="Choose the destination computer"
              value=""
            />
          )}
          <div className="flex items-center gap-1">
            <Button
              aria-label="Add SSH host"
              onClick={() => onCreate({ index: refs.length, isDestination: true })}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Settings2Icon aria-hidden="true" />
            </Button>
            <Button
              aria-label="Cancel adding a hop"
              onClick={() => setAddingHop(undefined)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <XIcon aria-hidden="true" />
            </Button>
          </div>
        </div>
      ) : null}

      <Button
        className="w-fit justify-start pl-2"
        disabled={!value || Boolean(addingHop)}
        onClick={() => setAddingHop('choose')}
        size="sm"
        type="button"
        variant="ghost"
      >
        <PlusIcon aria-hidden="true" /> Add hop
      </Button>
    </div>
  );
}

/**
 * Whether `index` names the destination slot: the last existing hop, or (an
 * empty route has no "last" index at all) the one and only slot there is.
 */
function isDestinationIndex(index: number, refs: readonly string[]): boolean {
  return index >= refs.length - 1;
}
