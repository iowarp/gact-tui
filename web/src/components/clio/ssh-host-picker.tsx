import { useQuery } from '@tanstack/react-query';
import { Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { profileSshHosts, sshHostDestination, type SshHost } from '@/lib/ssh-hosts';
import { deleteSshProfile, listSshProfiles, setSshProfileRoute } from '@/tauri/ssh-profiles';
import { SshConnectionRoute, type SshRouteStep } from './ssh-connection-route';
import { SshHostDialog } from './ssh-host-dialog';
import {
  emptyRouteRows,
  resolveRouteHop,
  routeFromSlots,
  routeSlots,
  routeSteps,
  type SshRouteCompleteness,
} from './ssh-route-utils';

type DialogState = { step: SshRouteStep; initial?: SshHost };

const routeKey = (host: SshHost | undefined) => JSON.stringify(routeSteps(host));

export function SshHostPicker({
  disabled = false,
  onChange,
  value,
}: {
  disabled?: boolean;
  onChange: (host: SshHost | undefined, route: SshRouteCompleteness) => void;
  value?: SshHost;
}) {
  const profiles = useQuery({
    queryKey: ['managed-service-ssh-profiles'],
    queryFn: listSshProfiles,
    staleTime: 60_000,
  });
  // The last opened step stays in place while the dialog animates closed;
  // a fresh key per open resets the form to that step's computer.
  const [dialog, setDialog] = useState<DialogState>({ step: { index: 0, isDestination: true } });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const openDialog = (next: DialogState) => {
    setDialog(next);
    setDialogKey((current) => current + 1);
    setDialogOpen(true);
  };
  const [routeError, setRouteError] = useState<string>();
  const [routeNotice, setRouteNotice] = useState<string>();
  // The rows, including empty ones, are this editor's own state; the route
  // reported to the caller is derived from them once every row is filled.
  const [slots, setSlots] = useState(() => routeSlots(value));
  const [seenKey, setSeenKey] = useState(() => routeKey(value));
  const [emittedKey, setEmittedKey] = useState(() => routeKey(value));
  if (routeKey(value) !== seenKey) {
    setSeenKey(routeKey(value));
    // The caller replaced the route (a reset, a deleted computer) rather than
    // adopting the one these rows produced.
    if (routeKey(value) !== emittedKey) setSlots(routeSlots(value));
  }
  const options = useMemo(() => profileSshHosts(profiles.data ?? []), [profiles.data]);
  const visibleOptions = useMemo(
    () =>
      value && !options.some((candidate) => candidate.id === value.id)
        ? [value, ...options]
        : options,
    [options, value],
  );

  /**
   * Apply a row edit. For a computer CLIO saved, only its route is written
   * back (never the rest of the profile); an imported OpenSSH profile is never
   * modified, so the edited route applies to this deployment only — and says so.
   */
  const changeSlots = async (nextSlots: string[], known: readonly SshHost[] = visibleOptions) => {
    const normalized = nextSlots.length ? nextSlots : [''];
    const next = routeFromSlots(normalized, (ref) => resolveRouteHop(ref, known));
    setSlots(normalized);
    setEmittedKey(routeKey(next));
    onChange(next, { emptyRows: emptyRouteRows(normalized) });
    setRouteError(undefined);
    setRouteNotice(undefined);
    const routeChanged =
      next &&
      value &&
      next.id === value.id &&
      JSON.stringify(next.jumpHosts ?? []) !== JSON.stringify(value.jumpHosts ?? []);
    if (!routeChanged || !next.profile) return;
    if (!next.managed) {
      setRouteNotice(
        `This route is used for this deployment only; your OpenSSH configuration is unchanged.`,
      );
      return;
    }
    try {
      await setSshProfileRoute(next.profile, next.jumpHosts ?? []);
      await profiles.refetch();
    } catch (error) {
      setRouteError(error instanceof Error ? error.message : String(error));
    }
  };

  const openConfigure = (step: SshRouteStep) => {
    const ref = slots[step.index];
    openDialog({ step, initial: ref ? resolveRouteHop(ref, visibleOptions) : undefined });
  };

  /** Place a freshly saved computer into the row the dialog was opened for. */
  const placeSaved = (saved: SshHost, step: SshRouteStep) => {
    const ref = sshHostDestination(saved);
    const nextSlots =
      step.index < slots.length
        ? slots.map((slot, index) => (index === step.index ? ref : slot))
        : [...slots, ref];
    void changeSlots(nextSlots, [saved, ...visibleOptions]);
  };

  return (
    <div className="grid gap-2">
      <SshConnectionRoute
        disabled={disabled}
        onConfigure={openConfigure}
        onCreate={(step) => openDialog({ step })}
        onSlotsChange={(next) => void changeSlots(next)}
        options={visibleOptions}
        slots={slots}
      />

      {routeError ? (
        <Alert variant="destructive">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>The route could not be saved</AlertTitle>
          <AlertDescription>{routeError}</AlertDescription>
        </Alert>
      ) : null}

      {routeNotice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {routeNotice}
        </p>
      ) : null}

      {value?.managed && value.profile ? (
        <Button
          aria-label={`Delete ${value.label}`}
          className="w-fit"
          disabled={disabled}
          onClick={async () => {
            await deleteSshProfile(value.profile ?? '');
            onChange(undefined, { emptyRows: [0] });
            await profiles.refetch();
          }}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon aria-hidden="true" /> Delete saved computer
        </Button>
      ) : null}

      <SshHostDialog
        initial={dialog.initial}
        key={dialogKey}
        onOpenChange={setDialogOpen}
        onSaved={async (saved) => {
          setDialogOpen(false);
          await profiles.refetch();
          placeSaved(saved, dialog.step);
        }}
        open={dialogOpen}
        options={visibleOptions}
        step={dialog.step}
      />
    </div>
  );
}
