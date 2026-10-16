import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { ConfigureIcon, DeleteIcon } from '@/lib/icon-vocabulary';
import { useRef, useState } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { profileSshHosts, type SshHost } from '@/lib/ssh-hosts';
import {
  deleteSshProfile,
  listAllSshProfiles,
  setSshProfileHidden,
  type SshProfile,
} from '@/tauri/ssh-profiles';
import { SshHostDialog } from './ssh-host-dialog';

const PROFILES_QUERY_KEY = ['managed-service-ssh-profiles'];
const ALL_PROFILES_QUERY_KEY = [...PROFILES_QUERY_KEY, 'all'];

/**
 * Every saved and imported SSH host in one place, so hiding a computer never
 * loses the only way back to it. A managed computer can be configured or
 * removed here, and only here: saved computers are configuration, not part of
 * a deployment. Imported OpenSSH definitions stay untouched when forgotten.
 *
 * Hiding is optimistic: the row and every picker update at once from the
 * cached lists, the preference is written in the background, and a failed
 * write puts both lists back. Nothing is re-listed, because visibility
 * changes no host's resolution.
 */
export function SshHostsManagerDialog({
  onOpenChange,
  onRemoved,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  onRemoved?: (profile: string) => void;
  open: boolean;
}) {
  const queryClient = useQueryClient();
  const allProfiles = useQuery({
    queryKey: ALL_PROFILES_QUERY_KEY,
    queryFn: listAllSshProfiles,
    enabled: open,
  });
  const [configuring, setConfiguring] = useState<SshHost>();
  const [configureOpen, setConfigureOpen] = useState(false);
  const [hideError, setHideError] = useState<string>();
  const [deleting, setDeleting] = useState<string>();
  const [removeTarget, setRemoveTarget] = useState<SshHost>();
  const [removeError, setRemoveError] = useState<string>();
  const hideVersions = useRef(new Map<string, number>());
  const hideWrites = useRef(new Map<string, Promise<void>>());

  const hosts = profileSshHosts(allProfiles.data ?? []);
  const hiddenByProfile = new Map(
    (allProfiles.data ?? []).map((profile) => [profile.name, profile.hidden ?? false]),
  );

  const toggleHidden = async (host: SshHost, hidden: boolean) => {
    const name = host.profile;
    if (!name) return;
    setHideError(undefined);
    const version = (hideVersions.current.get(name) ?? 0) + 1;
    hideVersions.current.set(name, version);
    const previousAll = queryClient.getQueryData<SshProfile[]>(ALL_PROFILES_QUERY_KEY);
    const previousVisible = queryClient.getQueryData<SshProfile[]>(PROFILES_QUERY_KEY);
    const changed = previousAll?.find((profile) => profile.name === name);
    queryClient.setQueryData<SshProfile[]>(ALL_PROFILES_QUERY_KEY, (current) =>
      current?.map((profile) => (profile.name === name ? { ...profile, hidden } : profile)),
    );
    if (previousVisible) {
      queryClient.setQueryData<SshProfile[]>(PROFILES_QUERY_KEY, (current = []) =>
        hidden
          ? current.filter((profile) => profile.name !== name)
          : changed && !current.some((profile) => profile.name === name)
            ? sortedByName([...current, { ...changed, hidden: false }])
            : current,
      );
    }
    const pending = (hideWrites.current.get(name) ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => setSshProfileHidden(name, hidden));
    hideWrites.current.set(name, pending);
    try {
      await pending;
    } catch (error) {
      if (hideVersions.current.get(name) !== version) return;
      // Roll back this row only. Another host may have been removed meanwhile.
      queryClient.setQueryData<SshProfile[]>(ALL_PROFILES_QUERY_KEY, (current) =>
        current?.map((profile) =>
          profile.name === name && changed ? { ...profile, hidden: changed.hidden } : profile,
        ),
      );
      if (previousVisible) {
        const original = previousVisible.find((profile) => profile.name === name);
        const restored = queryClient
          .getQueryData<SshProfile[]>(ALL_PROFILES_QUERY_KEY)
          ?.find((profile) => profile.name === name);
        queryClient.setQueryData<SshProfile[]>(PROFILES_QUERY_KEY, (current = []) =>
          original && restored
            ? sortedByName([...current.filter((profile) => profile.name !== name), restored])
            : current.filter((profile) => profile.name !== name),
        );
      }
      setHideError(error instanceof Error ? error.message : String(error));
    } finally {
      if (hideWrites.current.get(name) === pending) hideWrites.current.delete(name);
    }
  };

  const remove = async (host: SshHost) => {
    const name = host.profile;
    if (!name) return;
    setHideError(undefined);
    setRemoveError(undefined);
    setDeleting(name);
    try {
      await hideWrites.current.get(name)?.catch(() => undefined);
      await deleteSshProfile(name);
      hideVersions.current.delete(name);
      for (const key of [PROFILES_QUERY_KEY, ALL_PROFILES_QUERY_KEY]) {
        queryClient.setQueryData<SshProfile[]>(key, (current) =>
          current?.filter((profile) => profile.name.toLowerCase() !== name.toLowerCase()),
        );
      }
      onRemoved?.(name);
      setRemoveTarget(undefined);
      await queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
    } catch (error) {
      setRemoveError(error instanceof Error ? error.message : String(error));
    } finally {
      setDeleting(undefined);
    }
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Manage SSH hosts</DialogTitle>
            <DialogDescription>
              Hide keeps a host here so you can show it again. Remove forgets it from this app.
            </DialogDescription>
          </DialogHeader>

          {hideError || allProfiles.error ? (
            <p role="alert" className="text-xs text-destructive">
              {hideError || allProfiles.error?.message}
            </p>
          ) : null}

          <ScrollArea className="max-h-96">
            <ul aria-label="Saved and imported SSH hosts" className="grid gap-1" role="list">
              {hosts.length === 0 && !allProfiles.isPending ? (
                <li className="py-6 text-center text-sm text-muted-foreground" role="listitem">
                  No SSH hosts yet.
                </li>
              ) : null}
              {hosts.map((host) => {
                const isHidden = host.profile
                  ? (hiddenByProfile.get(host.profile) ?? false)
                  : false;
                return (
                  <li
                    className={`flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50 ${isHidden ? 'text-muted-foreground' : ''}`}
                    key={host.id}
                    role="listitem"
                  >
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm font-medium">{host.label}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge
                          title={
                            host.managed
                              ? 'Saved by this app'
                              : 'From your OpenSSH configuration (read-only)'
                          }
                          variant={host.managed ? 'default' : 'secondary'}
                        >
                          {host.managed ? 'Managed' : 'Imported'}
                        </Badge>
                        {isHidden ? <Badge variant="outline">Hidden</Badge> : null}
                      </div>
                    </div>
                    {host.managed ? (
                      <Button
                        aria-label={`Configure ${host.label}`}
                        onClick={() => {
                          setConfiguring(host);
                          setConfigureOpen(true);
                        }}
                        size="icon"
                        title={`Configure ${host.label}`}
                        type="button"
                        variant="ghost"
                      >
                        <ConfigureIcon aria-hidden="true" />
                      </Button>
                    ) : null}
                    <Button
                      aria-label={isHidden ? `Show ${host.label}` : `Hide ${host.label}`}
                      aria-pressed={isHidden}
                      className="w-20 justify-start"
                      disabled={deleting === host.profile}
                      onClick={() => void toggleHidden(host, !isHidden)}
                      size="sm"
                      title={
                        isHidden
                          ? `Show ${host.label} in pickers`
                          : `Hide ${host.label} from pickers`
                      }
                      type="button"
                      variant="ghost"
                    >
                      {isHidden ? (
                        <EyeIcon aria-hidden="true" />
                      ) : (
                        <EyeOffIcon aria-hidden="true" />
                      )}
                      {isHidden ? 'Show' : 'Hide'}
                    </Button>
                    <Button
                      aria-label={`Remove ${host.label}`}
                      className="w-24 justify-start"
                      disabled={Boolean(deleting)}
                      onClick={() => {
                        setRemoveError(undefined);
                        setRemoveTarget(host);
                      }}
                      size="sm"
                      title={`Remove ${host.label} from ${vocab.product}`}
                      type="button"
                      variant="ghost"
                    >
                      <DeleteIcon aria-hidden="true" /> Remove
                    </Button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(next) => {
          if (!next && !deleting) setRemoveTarget(undefined);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removeTarget?.label} from {vocab.product}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.managed
                ? 'This removes the saved SSH profile and any pasted key used only by this profile. Existing deployments and remote files are kept.'
                : 'This forgets the imported host in this app. Your OpenSSH configuration and SSH keys remain on this computer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="break-all rounded-md bg-muted p-3 font-mono text-sm">
            {removeTarget?.user ? `${removeTarget.user}@` : ''}
            {removeTarget?.host || removeTarget?.profile}:{removeTarget?.port}
          </p>
          {removeError ? (
            <p role="alert" className="text-sm text-destructive">
              {removeError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deleting)}>Keep host</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(deleting)}
              onClick={(event) => {
                event.preventDefault();
                if (removeTarget && !deleting) void remove(removeTarget);
              }}
            >
              {deleting ? 'Removing…' : 'Remove host'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SshHostDialog
        initial={configuring}
        key={configuring?.id}
        onOpenChange={setConfigureOpen}
        onSaved={async () => {
          setConfigureOpen(false);
          await queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
        }}
        open={configureOpen}
        options={hosts}
        step={{ index: 0, isDestination: true }}
      />
    </>
  );
}

function sortedByName(profiles: SshProfile[]): SshProfile[] {
  return [...profiles].sort((left, right) =>
    left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }),
  );
}
