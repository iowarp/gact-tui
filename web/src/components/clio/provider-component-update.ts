import type { ProviderComponentUpdate, ProviderComponentUpdateStage } from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { ProviderGroup } from './model-picker-model';

/** How often a running update's stage is read back while the panel shows it. */
export const PROVIDER_COMPONENT_UPDATE_POLL_MS = 700;
/** The update check is re-asked at most this often per open panel (the service caches too). */
const COMPONENTS_STALE_MS = 5 * 60_000;

/** The heartbeat/panel text of each running stage (`done`/`failed` settle it). */
const STAGE_TEXT: Record<ProviderComponentUpdateStage, string | undefined> = {
  checking: 'Checking…',
  downloading: 'Downloading…',
  installing: 'Installing…',
  verifying: 'Verifying…',
  done: undefined,
  failed: undefined,
};

interface UseProviderComponentUpdateInput {
  group: ProviderGroup | undefined;
  /** Whether the panel is showing: the update check runs only then. */
  open: boolean;
  /** Called once when an update finished and took effect without a restart. */
  onUpdated: () => void;
}

/**
 * The provider SDK update affordance's state: the service's update check
 * (`GET /v1/providers/{id}/components`, only for a provider whose catalog row
 * carries a `client` fact -- Claude Code), the running update's
 * stage (polled while it runs, also picked up when the panel reopens mid-update),
 * and the last finished job.
 */
export function useProviderComponentUpdate({
  group,
  open,
  onUpdated,
}: UseProviderComponentUpdateInput) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const presetId = group?.id ?? '';
  const componentsKey = queryKeys.key('provider-components', settings.endpoint, presetId);
  const jobKey = queryKeys.key('provider-component-update', settings.endpoint, presetId);
  const components = useQuery({
    queryKey: componentsKey,
    queryFn: ({ signal }) => repository.providerComponents(presetId, {}, signal),
    enabled: open && Boolean(presetId && group?.client),
    staleTime: COMPONENTS_STALE_MS,
  });
  const [tracking, setTracking] = useState(false);
  const job = useQuery({
    queryKey: jobKey,
    queryFn: ({ signal }) => repository.providerComponentUpdate(presetId, signal),
    enabled: tracking && Boolean(presetId),
    refetchInterval: (query) =>
      query.state.data?.running === false ? false : PROVIDER_COMPONENT_UPDATE_POLL_MS,
  });
  const start = useMutation({
    mutationFn: () => repository.updateProviderComponents(presetId),
    onSuccess: (started) => {
      queryClient.setQueryData(jobKey, started);
      setTracking(true);
    },
  });

  // An update already running when the panel opens (started from the other
  // surface, or before a reopen) is followed the same way.
  const runningOnService = components.data?.update?.running === true;
  useEffect(() => {
    if (runningOnService) setTracking(true);
  }, [runningOnService]);

  const current: ProviderComponentUpdate | undefined = tracking ? job.data : undefined;
  const notified = useRef<string>('');
  useEffect(() => {
    if (!tracking || !current || current.running) return;
    setTracking(false);
    void queryClient.invalidateQueries({ queryKey: componentsKey });
    const identity = `${presetId}:${current.started_at}`;
    if (
      current.stage === 'done' &&
      current.changed &&
      !current.restart_required &&
      notified.current !== identity
    ) {
      notified.current = identity;
      onUpdated();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settles once per finished job
  }, [tracking, current?.running, current?.stage]);

  const stage = start.isPending
    ? STAGE_TEXT.checking
    : current?.running
      ? STAGE_TEXT[current.stage]
      : undefined;
  const outcome = tracking ? undefined : (job.data ?? components.data?.update);
  return {
    components: components.data,
    stage,
    outcome: outcome?.running ? undefined : outcome,
    startError: start.error instanceof Error ? start.error.message : undefined,
    update: () => start.mutate(),
  };
}

export type ProviderComponentUpdateState = ReturnType<typeof useProviderComponentUpdate>;
