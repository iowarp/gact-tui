import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, EyeOffIcon, Settings2Icon } from 'lucide-react';
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
import { vocab } from '@/lib/brand-vocabulary';
import { profileSshHosts, type SshHost } from '@/lib/ssh-hosts';
import { listAllSshProfiles, setSshProfileHidden } from '@/tauri/ssh-profiles';
import { SshHostDialog } from './ssh-host-dialog';

const PROFILES_QUERY_KEY = ['managed-service-ssh-profiles'];
const ALL_PROFILES_QUERY_KEY = [...PROFILES_QUERY_KEY, 'all'];

/**
 * Every saved and imported SSH host in one place, so hiding a computer never
 * loses the only way back to it. A managed computer can be configured here
 * too; an imported OpenSSH host stays read-only apart from its visibility.
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
  const [pendingHide, setPendingHide] = useState<string>();
  const [hideError, setHideError] = useState<string>();

  const hosts = profileSshHosts(allProfiles.data ?? []);
  const hiddenByProfile = new Map(
    (allProfiles.data ?? []).map((profile) => [profile.name, profile.hidden ?? false]),
  );

  const refreshAfterVisibilityChange = async () => {
    await allProfiles.refetch();
    await queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
  };

  const toggleHidden = async (host: SshHost, hidden: boolean) => {
    if (!host.profile) return;
    setHideError(undefined);
    setPendingHide(host.profile);
    try {
      await setSshProfileHidden(host.profile, hidden);
      await refreshAfterVisibilityChange();
    } catch (error) {
      setHideError(error instanceof Error ? error.message : String(error));
    } finally {
      setPendingHide(undefined);
    }
  };

  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage SSH hosts</DialogTitle>
            <DialogDescription>
              Every computer {vocab.agent} saved and every host from your OpenSSH configuration.
              Hidden computers stay saved and can be restored here at any time.
            </DialogDescription>
          </DialogHeader>

          {hideError ? <p className="text-xs text-destructive">{hideError}</p> : null}

          <ScrollArea className="max-h-96">
            <ul aria-label="Saved and imported SSH hosts" className="grid gap-1" role="list">
              {hosts.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted-foreground" role="listitem">
                  No SSH hosts yet.
                </li>
              ) : null}
              {hosts.map((host) => {
                const isHidden = host.profile ? (hiddenByProfile.get(host.profile) ?? false) : false;
                return (
                  <li
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent/50"
                    key={host.id}
                    role="listitem"
                  >
                    <div className="grid min-w-0 flex-1 gap-0.5">
                      <span className="truncate text-sm font-medium">{host.label}</span>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={host.managed ? 'default' : 'secondary'}>
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
                        type="button"
                        variant="ghost"
                      >
                        <Settings2Icon aria-hidden="true" />
                      </Button>
                    ) : null}
                    <Button
                      aria-label={isHidden ? `Show ${host.label}` : `Hide ${host.label}`}
                      aria-pressed={isHidden}
                      disabled={pendingHide === host.profile}
                      onClick={() => void toggleHidden(host, !isHidden)}
                      size="icon"
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
          await allProfiles.refetch();
          await queryClient.invalidateQueries({ queryKey: PROFILES_QUERY_KEY });
        }}
        open={configureOpen}
        options={hosts}
        step={{ index: 0, isDestination: true }}
      />
    </>
  );
}
