import type { SavedServer } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/**
 * The saved local and self-hosted servers (`/v1/providers/servers`) and the
 * actions that change them. Every save and check runs one live check on the
 * service and returns it with the entry. A saved runtime address changes what
 * the service probes, so each change re-reads the provider list and catalog.
 */
export function useSavedServers() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const key = queryKeys.key('saved-servers', settings.endpoint);
  const servers = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.savedServers(false, signal),
  });

  const adopt = async (entry?: SavedServer) => {
    if (entry) {
      queryClient.setQueryData<SavedServer[]>(key, (current = []) =>
        current.some((item) => item.id === entry.id)
          ? current.map((item) => (item.id === entry.id ? entry : item))
          : [...current, entry],
      );
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: key }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.key('language-model-configuration', settings.endpoint),
      }),
      queryClient.invalidateQueries({ queryKey: queryKeys.providerCatalog(settings.endpoint) }),
    ]);
  };

  /** Save an address -- a catalog runtime's (`presetId`) or a new custom server -- and check it. */
  const save = useMutation({
    mutationFn: (input: { address: string; label?: string; presetId?: string; serverId?: string }) =>
      input.serverId
        ? repository.updateSavedServer(input.serverId, { address: input.address, label: input.label })
        : repository.addSavedServer({
            address: input.address,
            label: input.label,
            preset_id: input.presetId,
          }),
    onSuccess: adopt,
  });
  const check = useMutation({
    mutationFn: (serverId: string) => repository.checkSavedServer(serverId),
    onSuccess: adopt,
  });
  const remove = useMutation({
    mutationFn: (serverId: string) => repository.removeSavedServer(serverId),
    onSuccess: () => adopt(),
  });
  return { servers, save, check, remove };
}
