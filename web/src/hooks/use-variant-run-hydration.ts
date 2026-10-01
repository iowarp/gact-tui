import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';

/**
 * Rebuilds the session's variant runs (the draft tabs) after a reload, the
 * same way the transcript snapshot rebuilds its messages: clio-core serves
 * every run (LM- and user-judged, each try with its own steps), merged under
 * whatever the live stream already wrote. A failure is said, never hidden.
 */
export function useVariantRunHydration({
  enabled,
  sessionId,
}: {
  enabled: boolean;
  sessionId: string;
}): void {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const hydration = useQuery({
    queryKey: queryKeys.key('variant-runs', settings.endpoint, sessionId),
    queryFn: ({ signal }) => repository.variantRuns(sessionId, signal),
    enabled: enabled && Boolean(sessionId),
    staleTime: Number.POSITIVE_INFINITY,
  });
  useEffect(() => {
    if (hydration.data) useLiveStore.getState().hydrateVariantRuns(hydration.data);
  }, [hydration.data]);
  useEffect(() => {
    if (!hydration.error) return;
    toast.error('Earlier drafts could not be loaded', {
      id: `variant-runs:${sessionId}`,
      description: hydration.error instanceof Error ? hydration.error.message : undefined,
    });
  }, [hydration.error, sessionId]);
}
