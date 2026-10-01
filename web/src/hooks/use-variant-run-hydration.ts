import { variantRunsFromTrace, type VariantRuns } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useLiveStore } from '@/store/live-store';
import { useRepository } from './use-repository';

/**
 * Rebuilds the session's variant runs (the draft tabs) after a reload, the
 * same way the transcript snapshot rebuilds its messages: the durable
 * `variant.*` trace and the session's pick questions are folded with the live
 * reducer's own functions and merged under whatever the stream already wrote.
 * A deployment without a semantic trace still gets every pick question's drafts.
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
    queryFn: async ({ signal }): Promise<VariantRuns> => {
      const [trace, questions] = await Promise.all([
        repository.variantTrace(sessionId, signal),
        repository.questions(sessionId, signal),
      ]);
      // No semantic trace on this deployment: the pick questions still carry their drafts.
      const events = trace.status === 'available' ? trace.events : [];
      return variantRunsFromTrace(events, questions, sessionId);
    },
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
