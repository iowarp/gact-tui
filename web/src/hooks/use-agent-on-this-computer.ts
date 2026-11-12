import { useQuery } from '@tanstack/react-query';
import { connectionIsLocal } from '@/lib/connection';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from '@/hooks/use-repository';

/**
 * Whether the agent runs on this computer, so a folder can be used in place.
 *
 * The agent decides from the connection itself (a loopback client with no proxy
 * in between), whatever the connection profile is called. A route the app
 * tunnels through stays remote. An agent without the check falls back to the
 * profile.
 */
export function useAgentOnThisComputer(): boolean {
  const repository = useRepository();
  const { settings, isManagedConnection } = useConnectionSettings();
  const fromProfile = connectionIsLocal(settings, isManagedConnection);
  const tunnelled = Boolean(settings.infrastructure?.route);
  const locality = useQuery({
    queryKey: ['folder-attachment-locality', connectionScope(settings)],
    queryFn: ({ signal }) => repository.folderAttachmentLocality(signal),
    enabled: !tunnelled,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  if (tunnelled) return false;
  return locality.data?.same_computer ?? fromProfile;
}
