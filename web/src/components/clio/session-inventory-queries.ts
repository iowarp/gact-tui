import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { livePollInterval, useLiveStreamHealthy } from '@/hooks/use-live-poll-interval';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';

/** Inventory reads poll this often while no live stream refreshes the session. Unit: ms. */
const INVENTORY_POLL_MS = 5000;

/** Share the connected-source cache with the attachment and source-management views. */
export function useSessionConnectedSources(workspaceId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // Source edits invalidate this read; the poll only catches changes made elsewhere.
  const streamHealthy = useLiveStreamHealthy();
  return useQuery({
    queryKey: ['connected-storage', connectionScope(settings), workspaceId, 'sources'],
    queryFn: ({ signal }) => repository.connectedSources(workspaceId, signal),
    enabled: Boolean(workspaceId),
    refetchInterval: livePollInterval(INVENTORY_POLL_MS, streamHealthy),
  });
}

/** Read scheduled turns from their existing owner; hiding a card does not cancel work. */
export function useSessionSchedules(sessionId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const streamHealthy = useLiveStreamHealthy();
  return useQuery({
    queryKey: ['session-work-schedules', settings.endpoint, sessionId],
    queryFn: ({ signal }) => repository.scheduledTurns(sessionId, signal),
    enabled: Boolean(sessionId),
    // Work updates and finished turns invalidate it while the stream is live.
    refetchInterval: livePollInterval(INVENTORY_POLL_MS, streamHealthy),
  });
}
