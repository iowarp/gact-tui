import { loadSessionResource, type SessionResourceLoading } from '@/lib/session-resource-loading';
import type {
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
  ProvenanceProviderSummary,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { EXECUTION_PROVENANCE_LIMIT, EXECUTION_PROVENANCE_PAGE } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';
import { ph, plural, t } from '@lingui/core/macro';

/** Owns provider discovery and the selected session execution-provenance snapshot. */
export function useExecutionProvenance(sessionId: string, loading: SessionResourceLoading = {}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [requestedProvider, setRequestedProvider] = useState<string>();
  const providers = useQuery({
    queryKey: queryKeys.provenanceProviders(settings.endpoint),
    queryFn: ({ signal }) =>
      loadSessionResource(loading, signal, () => repository.provenanceProviders(signal)),
    enabled: loading.enabled !== false,
  });
  const provider = selectProvenanceProvider(
    requestedProvider,
    providers.data?.default_provider,
    providers.data?.providers,
  );
  const providerSummary = providers.data?.providers.find((item) => item.name === provider);
  const canQuery = Boolean(
    sessionId &&
      providerSummary?.configured &&
      providerSummary.queryable &&
      loading.enabled !== false,
  );
  // The newest page first; "Load earlier" widens the read one page at a time.
  const pageOwner = `${sessionId}\u0000${provider}`;
  const [page, setPage] = useState({ owner: pageOwner, limit: EXECUTION_PROVENANCE_PAGE });
  const limit = page.owner === pageOwner ? page.limit : EXECUTION_PROVENANCE_PAGE;
  const execution = useQuery({
    // A large optional graph must not evict the small log/work cache on departure.
    meta: { sessionCache: 'supplementary' },
    queryKey: queryKeys.executionProvenance(settings.endpoint, sessionId, provider, limit),
    // Its own lane: one slow graph read (seconds on a long session) must not hold
    // a shared-queue slot that the quick work, diff and context reads wait on.
    queryFn: ({ signal }) => repository.executionProvenance(sessionId, { provider, limit }, signal),
    enabled: canQuery,
    // A wider page keeps the records already shown until it arrives.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === sessionId && previousQuery.queryKey[3] === provider
        ? previous
        : undefined,
  });
  const paged = limit < EXECUTION_PROVENANCE_LIMIT;
  const hasEarlier = Boolean(execution.data?.truncated) && paged && !execution.isPlaceholderData;
  const loadingEarlier = execution.isPlaceholderData && execution.isFetching;
  const loadEarlier = useCallback(
    () =>
      setPage({
        owner: pageOwner,
        limit: Math.min(limit + EXECUTION_PROVENANCE_PAGE, EXECUTION_PROVENANCE_LIMIT),
      }),
    [limit, pageOwner, setPage],
  );
  const degradation = useMemo(() => {
    if (providers.isPending) return undefined;
    return executionProvenanceDegradation({
      execution: execution.data,
      executionError: execution.error,
      paged,
      provider,
      providerSummary,
      providersError: providers.error,
    });
  }, [
    execution.data,
    execution.error,
    paged,
    provider,
    providerSummary,
    providers.error,
    providers.isPending,
  ]);

  return {
    degradation,
    execution,
    /** Older records exist beyond the loaded pages. */
    hasEarlier,
    loadEarlier,
    loadingEarlier,
    /** Records asked for so far. */
    limit,
    provider,
    providerSummary,
    providers,
    setProvider: setRequestedProvider,
  };
}

export function selectProvenanceProvider(
  requested: string | undefined,
  defaultProvider: string | undefined,
  providers: readonly ProvenanceProviderSummary[] | undefined,
): string {
  if (requested && providers?.some((provider) => provider.name === requested)) return requested;
  return defaultProvider ?? providers?.[0]?.name ?? 'native';
}

export function executionProvenanceDegradation({
  execution,
  executionError,
  paged,
  provider,
  providerSummary,
  providersError,
}: {
  execution?: ExecutionProvenanceResult;
  executionError?: Error | null;
  /** The read asked for a page of the newest records, not the whole history. */
  paged?: boolean;
  provider: string;
  providerSummary?: ProvenanceProviderSummary;
  providersError?: Error | null;
}): ExecutionProvenanceDegradation | undefined {
  if (providersError) {
    return unavailable(
      'provenance_provider_discovery_unavailable',
      providersError.message || t`The provenance provider catalog is unavailable.`,
      provider,
    );
  }
  if (!providerSummary) {
    return unavailable(
      'provenance_provider_unavailable',
      t`The service did not advertise the ${provider} provenance provider.`,
      provider,
    );
  }
  if (!providerSummary.configured || !providerSummary.queryable) {
    return unavailable(
      'provenance_provider_not_queryable',
      `${providerSummary.name} is ${providerSummary.status} and cannot be queried.`,
      providerSummary.name,
    );
  }
  if (executionError) {
    return unavailable(
      'execution_provenance_unavailable',
      executionError.message || t`${provider} execution provenance is unavailable.`,
      provider,
    );
  }
  if (!execution) return undefined;
  // A page of the newest records is truncated by design, and its oldest
  // relationships may point at records on earlier pages; neither is degradation.
  const pageCut = Boolean(paged && execution.truncated);
  const nodeIds = new Set(execution.nodes.map((node) => node.id));
  const danglingEdges = pageCut
    ? 0
    : execution.edges.filter((edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target))
        .length;
  const truncated = execution.truncated && !pageCut;
  if (!execution.complete || truncated || danglingEdges) {
    const reasons = [
      !execution.complete ? t`the provider marked the snapshot incomplete` : undefined,
      truncated ? t`the result reached the service limit` : undefined,
      danglingEdges
        ? plural(danglingEdges, {
            one: '# relationship references missing nodes',
            other: '# relationships reference missing nodes',
          })
        : undefined,
    ].filter(Boolean);
    return {
      code: 'execution_provenance_partial',
      reason: t`Partial ${provider} provenance: ${ph({ reasons: reasons.join('; ') })}.`,
      capability: 'execution_provenance',
      recoverable: true,
      provider,
      partial: true,
    };
  }
  return undefined;
}

function unavailable(
  code: string,
  reason: string,
  provider: string,
): ExecutionProvenanceDegradation {
  return {
    code,
    reason,
    capability: 'execution_provenance',
    recoverable: true,
    provider,
    partial: false,
  };
}
