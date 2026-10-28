import type { ActionCardAction } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
  SpotterQuarantineCard,
  type SpotterQuarantine,
} from '@/components/clio/spotter-quarantine-card';
import { invalidateQueriesInBackground } from '@/lib/query-invalidation';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/** The session's active SPOTTER quarantine (``metadata.spotter_quarantine``), if any. */
function activeQuarantine(metadata: Record<string, unknown> | undefined) {
  const record = metadata?.spotter_quarantine;
  if (!record || typeof record !== 'object') return undefined;
  const row = record as Record<string, unknown>;
  if (row.status !== 'active') return undefined;
  return {
    title: typeof row.title === 'string' ? row.title : 'SPOTTER detected a danger',
    detail: typeof row.detail === 'string' ? row.detail : '',
    watcher_handle: typeof row.watcher_handle === 'string' ? row.watcher_handle : '',
    raised_at: typeof row.raised_at === 'string' ? row.raised_at : undefined,
  } satisfies SpotterQuarantine;
}

/**
 * A quarantined session's composer state: ``active`` disables the message box, and
 * ``withCard`` puts the quarantine card above it (Discuss opens SPOTTER beside the
 * conversation through ``discuss``; Lift quarantine is the person's call).
 */
export function useSpotterQuarantine(
  session: { id: string; metadata?: Record<string, unknown> } | undefined,
  discuss: (action: ActionCardAction) => Promise<unknown>,
) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const quarantine = activeQuarantine(session?.metadata);
  const lift = useMutation({
    mutationFn: () => repository.liftSpotterQuarantine(session?.id ?? ''),
    onSuccess: () =>
      invalidateQueriesInBackground(queryClient, [queryKeys.allSessionReads(settings.endpoint)]),
    onError: (error: unknown) =>
      toast.error('The quarantine was not lifted', {
        description: error instanceof Error ? error.message : 'The service refused.',
      }),
  });
  const card = quarantine ? (
    <SpotterQuarantineCard
      lifting={lift.isPending}
      onDiscuss={() =>
        void discuss({
          id: 'discuss',
          label: 'Discuss',
          enabled: Boolean(quarantine.watcher_handle),
          behavior: { kind: 'focus_session', handle_id: quarantine.watcher_handle },
        }).catch((error: unknown) =>
          toast.error('Could not open SPOTTER', {
            description: error instanceof Error ? error.message : undefined,
          }),
        )
      }
      onLift={() => lift.mutate()}
      quarantine={quarantine}
    />
  ) : null;
  return {
    active: Boolean(quarantine),
    withCard: (panel: ReactNode) =>
      card ? (
        <>
          {card}
          {panel}
        </>
      ) : (
        panel
      ),
  };
}
