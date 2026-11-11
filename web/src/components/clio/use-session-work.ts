import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { livePollInterval, useLiveStreamHealthy } from '@/hooks/use-live-poll-interval';

/** Read the same authoritative work ledger for full and compact session views. */
export function useSessionWork(sessionId: string, cursor = 0) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  // session.work.updated events invalidate this read while the stream is live.
  const streamHealthy = useLiveStreamHealthy();
  return useQuery({
    queryKey: ['session-work', settings.endpoint, sessionId, cursor],
    queryFn: ({ signal }) => repository.sessionWork(sessionId, cursor, signal),
    enabled: Boolean(sessionId),
    refetchInterval: livePollInterval(5000, streamHealthy),
  });
}
