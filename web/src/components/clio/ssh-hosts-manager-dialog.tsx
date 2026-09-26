import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import { useState } from 'react';
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
import { listAllSshProfiles, setSshProfileHidden, type SshProfile } from '@/tauri/ssh-profiles';
import { SshHostDialog } from './ssh-host-dialog';

const PROFILES_QUERY_KEY = ['managed-service-ssh-profiles'];
const ALL_PROFILES_QUERY_KEY = [...PROFILES_QUERY_KEY, 'all'];

/**
 * Every saved and imported SSH host in one place, so hiding a computer never
 * loses the only way back to it. A managed computer can be configured here
 * too; an imported OpenSSH host stays read-only apart from its visibility.
 *
 * Hiding is optimistic: the row and every picker update at once from the
 * cached lists, the preference is written in the background, and a failed
 * write puts both lists back. Nothing is re-listed, because visibility
 * changes no host's resolution.
 */
export function SshHostsManagerDialog({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
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

  const hosts = profileSshHosts(allProfiles.data ?? []);
  const hiddenByProfile = new Map(
    (allProfiles.data ?? []).map((profile) => [profile.name, profile.hidden ?? false]),
  );

  const toggleHidden = async (host: SshHost, hidden: boolean) => {
    const name = host.profile;
    if (!name) return;
    setHideError(undefined);
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
    try {
      await setSshProfileHidden(name, hidden);
    } catch (error) {
      queryClient.setQueryData(ALL_PROFILES_QUERY_KEY, previousAll);
      if (previousVisible) queryClient.setQueryData(PROFILES_QUERY_KEY, previousVisible);
      setHideError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage SSH hosts</DialogTitle>
            <DialogDescription className="sr-only">
              Saved and imported SSH hosts, including hidden ones.
            </DialogDescription>
          </DialogHeader>

          {hideError ? <p className="text-xs text-destructive">{hideError}</p> : null}

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
                      onClick={() => void toggleHidden(host, !isHidden)}
                      size="icon"
                      title={
                        isHidden
                          ? `Show ${host.label} in pickers`
                          : `Hide ${host.label} from pickers`
                      }
                      type="button"
                      variant="ghost"
                    >
                      {isHidden ? (
                        <EyeOffIcon aria-hidden="true" />
                      ) : (
                        <EyeIcon aria-hidden="true" />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </DialogContent>
      </Dialog>

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
