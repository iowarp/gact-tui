import type {
  LanguageModelConfiguration,
  ProviderHandshake,
  ProviderInstallJob,
} from '@clio/core/v3';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { create } from 'zustand';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { ProviderActionStage } from './provider-actions';

/** How often running installs are read back while any runs. */
export const PROVIDER_INSTALL_POLL_MS = 1000;
/** A view that mounts re-reads the jobs at most this often when none runs. */
const INSTALL_JOBS_STALE_MS = 2000;

/**
 * What happened after a provider's install finished, kept app-wide so it
 * survives the view that started it: the provider check that follows a
 * successful install, or why the install failed.
 */
interface ProviderInstallOutcome {
  stage?: Extract<ProviderActionStage, 'Checking…' | 'Finding models…'>;
  check?: ProviderHandshake;
  failure?: string;
}

interface ProviderInstallStore {
  outcomes: Record<string, ProviderInstallOutcome>;
  update: (key: string, outcome: ProviderInstallOutcome | undefined) => void;
}

/** Install outcomes by connected agent and provider; never per component. */
export const useProviderInstallStore = create<ProviderInstallStore>((set) => ({
  outcomes: {},
  update: (key, outcome) =>
    set((state) => {
      const outcomes = { ...state.outcomes };
      if (outcome) outcomes[key] = outcome;
      else delete outcomes[key];
      return { outcomes };
    }),
}));

const outcomeKey = (endpoint: string, providerId: string) => `${endpoint}\u0000${providerId}`;

export const providerInstallJobsKey = (endpoint: string) =>
  queryKeys.key('provider-install-jobs', endpoint);

/** Put a job the agent just answered with into the shared list. */
export function upsertProviderInstallJob(
  queryClient: QueryClient,
  endpoint: string,
  job: ProviderInstallJob,
): void {
  queryClient.setQueryData<ProviderInstallJob[]>(providerInstallJobsKey(endpoint), (jobs = []) => [
    ...jobs.filter((item) => item.provider_id !== job.provider_id),
    job,
  ]);
}

/** Every provider's latest install on the connected agent, polled while any runs. */
export function useProviderInstallJobs() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  return useQuery({
    queryKey: providerInstallJobsKey(settings.endpoint),
    queryFn: ({ signal }) => repository.providerInstallJobs(signal),
    staleTime: INSTALL_JOBS_STALE_MS,
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.running) ? PROVIDER_INSTALL_POLL_MS : false,
  });
}

/** The visible stage of a provider's install, from its job and what followed it. */
export function providerInstallStage(
  job: ProviderInstallJob | undefined,
  outcome: ProviderInstallOutcome | undefined,
): ProviderActionStage | undefined {
  if (job?.state === 'queued') return 'Waiting to install…';
  if (job?.state === 'installing') return 'Installing…';
  return outcome?.stage;
}

/** One provider's install as every surface shows it. */
export function useProviderInstall(providerId: string) {
  const { settings } = useConnectionSettings();
  const jobs = useProviderInstallJobs();
  const job = jobs.data?.find((item) => item.provider_id === providerId);
  const outcome = useProviderInstallStore(
    (state) => state.outcomes[outcomeKey(settings.endpoint, providerId)],
  );
  const update = useProviderInstallStore((state) => state.update);
  const clear = useCallback(
    () => update(outcomeKey(settings.endpoint, providerId), undefined),
    [providerId, settings.endpoint, update],
  );
  return {
    job,
    stage: providerInstallStage(job, outcome),
    check: outcome?.check,
    failure: outcome?.failure,
    clear,
  };
}

/** The install stage of every provider with one running, for rows not in view. */
export function useProviderInstallStages(): ReadonlyMap<string, ProviderActionStage> {
  const { settings } = useConnectionSettings();
  const jobs = useProviderInstallJobs();
  const outcomes = useProviderInstallStore((state) => state.outcomes);
  return useMemo(() => {
    const stages = new Map<string, ProviderActionStage>();
    for (const job of jobs.data ?? []) {
      const stage = providerInstallStage(
        job,
        outcomes[outcomeKey(settings.endpoint, job.provider_id)],
      );
      if (stage) stages.set(job.provider_id, stage);
    }
    return stages;
  }, [jobs.data, outcomes, settings.endpoint]);
}

/**
 * Settle a finished install, wherever the person is now: a failure is kept
 * (and toasted) for the provider's panel, and a success runs the provider
 * check and catalog refresh the install action used to run inline.
 */
export function useSettleProviderInstall() {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const update = useProviderInstallStore((state) => state.update);
  return useCallback(
    async (job: ProviderInstallJob) => {
      const providerId = job.provider_id;
      const key = outcomeKey(settings.endpoint, providerId);
      if (job.state === 'failed') {
        const failure = job.error?.message || 'The install failed.';
        update(key, { failure });
        toast.error(failure);
        return;
      }
      const configurationKey = queryKeys.key('language-model-configuration', settings.endpoint);
      const modelsKey = queryKeys.key('provider-models', settings.endpoint, providerId);
      const apiBase = queryClient
        .getQueryData<LanguageModelConfiguration>(configurationKey)
        ?.presets.find((preset) => preset.id === providerId)?.api_base;
      try {
        update(key, { stage: 'Checking…' });
        const check = await repository.providerHandshake(providerId, { apiBase, refresh: true });
        update(key, { stage: 'Finding models…', check });
        if (check.connectivity === 'ok' && check.auth === 'ok') {
          queryClient.setQueryData(modelsKey, await repository.providerModels(providerId));
        }
        const catalog = await repository.providerCatalog(false, undefined, providerId);
        queryClient.setQueryData(queryKeys.providerCatalog(settings.endpoint), catalog);
        await Promise.all(
          [
            configurationKey,
            modelsKey,
            queryKeys.key('provider-components', settings.endpoint, providerId),
          ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
        update(key, { check });
      } catch (error) {
        update(key, {
          failure: error instanceof Error ? error.message : 'Could not check the provider.',
        });
      }
    },
    [queryClient, repository, settings.endpoint, update],
  );
}

/**
 * Follows every provider install the agent runs, mounted once for the app:
 * the install keeps going and settles when the person has moved to another
 * provider, closed the picker or changed views.
 */
export function ProviderInstallMonitor(): null {
  const jobs = useProviderInstallJobs();
  const settleInstall = useSettleProviderInstall();
  const following = useRef(new Map<string, string>());
  useEffect(() => {
    for (const job of jobs.data ?? []) {
      if (job.running) {
        following.current.set(job.provider_id, job.started_at);
      } else if (following.current.get(job.provider_id) === job.started_at) {
        following.current.delete(job.provider_id);
        void settleInstall(job);
      }
    }
  }, [jobs.data, settleInstall]);
  return null;
}
