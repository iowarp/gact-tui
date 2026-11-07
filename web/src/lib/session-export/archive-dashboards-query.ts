import { useQueries } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';

/**
 * The dashboards each session published, as the export captured them (the newest
 * version of each). An archive made before dashboards were captured has no list:
 * it shows none rather than an error.
 */
export function useArchiveDashboards(sessionIds: readonly string[]) {
  const repository = useRepository();
  return useQueries({
    queries: sessionIds.map((sessionId) => ({
      queryKey: ['archive-dashboards', sessionId],
      queryFn: () => repository.dashboards(sessionId),
    })),
    combine: (results) =>
      results.flatMap((result, index) =>
        (result.data ?? []).map((dashboard) => ({ sessionId: sessionIds[index]!, dashboard })),
      ),
  });
}
