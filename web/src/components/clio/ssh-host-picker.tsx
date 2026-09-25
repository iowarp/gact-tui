import { useQuery } from '@tanstack/react-query';
import { Trash2Icon, TriangleAlertIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { vocab } from '@/lib/brand-vocabulary';
import { profileSshHosts, sshHostDestination, type SshHost } from '@/lib/ssh-hosts';
import { deleteSshProfile, listSshProfiles, setSshProfileRoute } from '@/tauri/ssh-profiles';
import { SshConnectionRoute, type SshRouteStep } from './ssh-connection-route';
import { SshHostDialog } from './ssh-host-dialog';
import { resolveRouteHop, routeSteps } from './ssh-route-utils';

type DialogState = { step: SshRouteStep; initial?: SshHost };

export function SshHostPicker({
  onChange,
  value,
}: {
  onChange: (host: SshHost | undefined) => void;
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
  const options = useMemo(() => profileSshHosts(profiles.data ?? []), [profiles.data]);
  const visibleOptions = useMemo(
    () =>
      value && !options.some((candidate) => candidate.id === value.id)
        ? [value, ...options]
        : options,
    [options, value],
  );

  /**
   * Apply a route edit. For a computer CLIO saved, only its route is written
   * back (never the rest of the profile); an imported OpenSSH profile is never
   * modified, so the edited route applies to this deployment only — and says so.
   */
  const changeRoute = async (next: SshHost | undefined) => {
    onChange(next);
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
        `This route is used for this deployment only. ${next.label} comes from your OpenSSH configuration, which ${vocab.agent} does not change.`,
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
    const refs = routeSteps(value);
    openDialog({
      step,
      initial: step.index < refs.length ? resolveRouteHop(refs[step.index], visibleOptions) : undefined,
    });
  };

  /** Place a freshly saved computer into the step the dialog was opened for. */
  const placeSaved = (saved: SshHost, step: SshRouteStep) => {
    const refs = routeSteps(value);
    const nextRefs =
      step.index < refs.length
        ? refs.map((ref, index) => (index === step.index ? sshHostDestination(saved) : ref))
        : [...refs, sshHostDestination(saved)];
    const destination = resolveRouteHop(nextRefs[nextRefs.length - 1], [saved, ...visibleOptions]);
    void changeRoute({ ...destination, jumpHosts: nextRefs.slice(0, -1) });
  };

  return (
    <div className="grid gap-2">
      <SshConnectionRoute
        onChange={(next) => void changeRoute(next)}
        onConfigure={openConfigure}
        onCreate={(step) => openDialog({ step })}
        options={visibleOptions}
        value={value}
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
          onClick={async () => {
            await deleteSshProfile(value.profile ?? '');
            onChange(undefined);
            await profiles.refetch();
          }}
          className="w-fit"
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
