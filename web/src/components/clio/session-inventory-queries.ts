import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';

/** Share the connected-source cache with the attachment and source-management views. */
export function useSessionConnectedSources(workspaceId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: ['connected-storage', connectionScope(settings), workspaceId, 'sources'],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
    enabled: Boolean(workspaceId),
    refetchInterval: 5000,
  });
}

/** Read scheduled turns from their existing owner; hiding a card does not cancel work. */
export function useSessionSchedules(sessionId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: ['session-work-schedules', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.scheduledTurns(sessionId, signal),
    enabled: Boolean(sessionId),
    refetchInterval: 5000,
  });
}
