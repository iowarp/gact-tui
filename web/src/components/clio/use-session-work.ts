import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

/** Read the same authoritative work ledger for full and compact session views. */
export function useSessionWork(sessionId: string, cursor = 0) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: ['session-work', settings.endpoint, sessionId, cursor],
    queryFn: ({ signal }) => repository.sessionWork(sessionId, cursor, signal),
    enabled: Boolean(sessionId),
    refetchInterval: 5000,
  });
}
