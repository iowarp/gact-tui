import type {
  ExecutionProvenanceDegradation,
  ExecutionProvenanceResult,
  ProvenanceProviderSummary,
} from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { queryKeys } from '@/lib/query-keys';
import { EXECUTION_PROVENANCE_LIMIT } from '@/lib/runtime-limits';
import { useConnectionSettings } from '@/providers/connection-provider';
import { useRepository } from './use-repository';

/** Owns provider discovery and the selected session execution-provenance snapshot. */
export function useExecutionProvenance(sessionId: string) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [requestedProvider, setRequestedProvider] = useState<string>();
  const providers = useQuery({
    queryKey: queryKeys.provenanceProviders(settings.endpoint),
    queryFn: ({ signal }) => repository.provenanceProviders(signal),
  });
  const provider = selectProvenanceProvider(
    requestedProvider,
    providers.data?.default_provider,
    providers.data?.providers,
  );
  const providerSummary = providers.data?.providers.find((item) => item.name === provider);
  const canQuery = Boolean(sessionId && providerSummary?.configured && providerSummary.queryable);
  const execution = useQuery({
    queryKey: queryKeys.executionProvenance(settings.endpoint, sessionId, provider),
    queryFn: ({ signal }) =>
      repository.executionProvenance(
        sessionId,
        { provider, includeChildren: true, limit: EXECUTION_PROVENANCE_LIMIT },
        signal,
      ),
    enabled: canQuery,
  });
  const degradation = useMemo(() => {
    if (providers.isPending) return undefined;
    return executionProvenanceDegradation({
      execution: execution.data,
      executionError: execution.error,
      provider,
      providerSummary,
      providersError: providers.error,
    });
  }, [
    execution.data,
    execution.error,
    provider,
    providerSummary,
    providers.error,
    providers.isPending,
  ]);

  return {
    degradation,
    execution,
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
  provider,
  providerSummary,
  providersError,
}: {
  execution?: ExecutionProvenanceResult;
  executionError?: Error | null;
  provider: string;
  providerSummary?: ProvenanceProviderSummary;
  providersError?: Error | null;
}): ExecutionProvenanceDegradation | undefined {
  if (providersError) {
    return unavailable(
      'provenance_provider_discovery_unavailable',
      providersError.message || 'The provenance provider catalog is unavailable.',
      provider,
    );
  }
  if (!providerSummary) {
    return unavailable(
      'provenance_provider_unavailable',
      `The service did not advertise the ${provider} provenance provider.`,
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
      executionError.message || `${provider} execution provenance is unavailable.`,
      provider,
    );
  }
  if (!execution) return undefined;
  const nodeIds = new Set(execution.nodes.map((node) => node.id));
  const danglingEdges = execution.edges.filter(
    (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target),
  ).length;
  if (!execution.complete || execution.truncated || danglingEdges) {
    const reasons = [
      !execution.complete ? 'the provider marked the snapshot incomplete' : undefined,
      execution.truncated ? 'the result reached the service limit' : undefined,
      danglingEdges ? `${danglingEdges} relationships reference missing nodes` : undefined,
    ].filter(Boolean);
    return {
      code: 'execution_provenance_partial',
      reason: `Partial ${provider} provenance: ${reasons.join('; ')}.`,
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
