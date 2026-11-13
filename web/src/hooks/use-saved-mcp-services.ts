import type { SavedMcpService } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ph, t } from '@lingui/core/macro';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';

/** The MCP services the person saved, here or with `clio-agent mcp add`. */
export function useSavedMcpServices() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: queryKeys.key('mcp-configurations', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.savedMcpServices(signal),
  });
}

/**
 * Removes a saved MCP service; new conversations then no longer get it. A row
 * asks first with its inline confirm (`RowConfirm`); `onRemoved` runs on success.
 */
export function useRemoveSavedMcp(onRemoved?: (service: SavedMcpService) => void) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  return useMutation({
    mutationFn: (target: SavedMcpService) => repository.removeMcpConfiguration(target.name),
    onSuccess: async (_value, target) => {
      onRemoved?.(target);
      await Promise.all(
        (['mcp-configurations', 'mcp-servers', 'tools'] as const).map((key) =>
          queryClient.invalidateQueries({ queryKey: queryKeys.key(key, settings.endpoint) }),
        ),
      );
      toast.success(t`Removed ${ph({ name: target.name })}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
