import { PROTOCOL_VERSION, TransportError } from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createRepository, type ConnectionSettings, type SavedConnection } from '@/lib/connection';
import { PROTOCOL } from '@/lib/brand-vocabulary';
import { HISTORY_MODE_DETAIL, HISTORY_MODE_LABEL, isHistoryMode } from '@/lib/context-mode';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  CONNECTION_PROBE_FAST_ATTEMPTS,
  CONNECTION_PROBE_POLL_MS,
  CONNECTION_PROBE_STARTING_MS,
  CONNECTION_PROBE_RETRIES,
  CONNECTION_PROBE_RETRY_BASE_MS,
  CONNECTION_PROBE_RETRY_MAX_MS,
  CONNECTION_PROBE_STALE_TIME_MS,
  CONNECTION_PROBE_TIMEOUT_MS,
} from '@/lib/runtime-limits';

export type ConnectionAvailabilityState = 'checking' | 'healthy' | 'degraded' | 'unavailable';

export interface ConnectionAvailability {
  state: ConnectionAvailabilityState;
  label: string;
  detail: string;
  diagnostics?: string;
  /** The service answered but is still starting; it is re-checked every second. */
  starting?: boolean;
}

/** What a starting service is still bringing up, in words (`/v1/health` `starting`). */
const STARTING_ITEMS: Readonly<Record<string, string>> = {
  task_runtime: 'conversations and tasks',
  marketplace: 'plugins',
  agent: 'the agent',
};

function startingDetail(items: readonly string[] | undefined): string {
  const named = (items ?? []).map((item) => STARTING_ITEMS[item] ?? item.replaceAll('_', ' '));
  return named.length
    ? `Starting up: loading ${named.join(', ')}. It opens by itself when it is ready.`
    : 'Starting up. It opens by itself when it is ready.';
}

/**
 * Re-probe quickly while a service is starting or has not answered yet, so a service
 * started at the same time as this page is noticed within a second; slow down after
 * about two minutes of silence.
 */
export function connectionProbeInterval(query: {
  state: { data?: ConnectionAvailability; status: string; errorUpdateCount: number };
}): number {
  const { data, status, errorUpdateCount } = query.state;
  if (data?.starting) return CONNECTION_PROBE_STARTING_MS;
  if (status === 'error' && errorUpdateCount < CONNECTION_PROBE_FAST_ATTEMPTS) {
    return CONNECTION_PROBE_STARTING_MS;
  }
  return CONNECTION_PROBE_POLL_MS;
}

export type ConnectionAvailabilityMap = Readonly<Record<string, ConnectionAvailability>>;

/** Nothing answered: say what that means and what to do, not just that it failed. */
export const NOT_REACHABLE_DETAIL =
  'Nothing answered at this address yet. If the service was just started, this page connects by itself once it is up; otherwise start it or check the address.';

const CHECKING_CONNECTION: ConnectionAvailability = {
  state: 'checking',
  label: 'Checking',
  detail: 'Checking this service now.',
};

/** Return the latest probe result for a saved endpoint. */
export function connectionAvailability(
  availability: ConnectionAvailabilityMap,
  endpoint: string,
): ConnectionAvailability {
  return availability[endpoint] ?? CHECKING_CONNECTION;
}

/** Probe remembered services without changing the active connection. */
export function useConnectionAvailabilities(
  connections: readonly SavedConnection[],
): ConnectionAvailabilityMap {
  const { resolveConnection } = useConnectionSettings();
  const queries = useQueries({
    queries: connections.map((connection) => ({
      queryKey: queryKeys.key('connection-availability', connection.endpoint),
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const resolved = await resolveConnection(connection);
        return probeConnection(resolved, signal);
      },
      refetchInterval: connectionProbeInterval,
      refetchOnMount: 'always' as const,
      retry: CONNECTION_PROBE_RETRIES,
      retryDelay: (attempt: number) =>
        Math.min(CONNECTION_PROBE_RETRY_BASE_MS * 2 ** attempt, CONNECTION_PROBE_RETRY_MAX_MS),
      staleTime: CONNECTION_PROBE_STALE_TIME_MS,
    })),
  });

  return useMemo(
    () =>
      Object.fromEntries(
        connections.map((connection, index) => [
          connection.endpoint,
          queries[index]?.data ?? availabilityFromError(queries[index]?.error),
        ]),
      ),
    [connections, queries],
  );
}

export async function probeConnection(
  settings: ConnectionSettings,
  signal: AbortSignal,
): Promise<ConnectionAvailability> {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort();
  signal.addEventListener('abort', forwardAbort, { once: true });
  const timeout = globalThis.setTimeout(() => controller.abort(), CONNECTION_PROBE_TIMEOUT_MS);

  try {
    const repository = createRepository(settings);
    const capabilities = await repository.capabilities(controller.signal);
    if (!capabilities.gact_versions.includes(PROTOCOL_VERSION)) {
      return {
        state: 'unavailable',
        label: 'Incompatible',
        detail: `Requires ${PROTOCOL.gact} ${PROTOCOL_VERSION}.`,
      };
    }

    try {
      const health = await repository.serviceHealth(controller.signal);
      if (health.readiness === 'starting') {
        return {
          state: 'checking',
          label: 'Starting',
          detail: startingDetail(health.starting),
          starting: true,
        };
      }
      if (health.healthy && isHistoryMode(health)) {
        return { state: 'degraded', label: HISTORY_MODE_LABEL, detail: HISTORY_MODE_DETAIL };
      }
      return health.healthy
        ? { state: 'healthy', label: 'Ready', detail: 'Service is available.' }
        : {
            state: 'degraded',
            label: 'Limited',
            detail: health.overall_status || 'Service is available with limitations.',
          };
    } catch (error) {
      rethrowCancelledProbe(error, signal, controller.signal);
      // A compatible capabilities response already proves the service is reachable.
      return {
        state: 'degraded',
        label: 'Limited',
        detail: 'The service responded, but its health status could not be verified.',
      };
    }
  } catch (error) {
    rethrowCancelledProbe(error, signal, controller.signal);
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
    signal.removeEventListener('abort', forwardAbort);
  }
}

function rethrowCancelledProbe(
  error: unknown,
  requestSignal: AbortSignal,
  probeSignal: AbortSignal,
): void {
  if (requestSignal.aborted) throw error;
  if (probeSignal.aborted) throw new Error('The service did not respond in time.');
}

function availabilityFromError(error: unknown): ConnectionAvailability {
  if (!error || (error instanceof Error && error.name === 'AbortError')) {
    return CHECKING_CONNECTION;
  }
  if (error instanceof TransportError && error.code === 'network_unavailable') {
    return {
      state: 'unavailable',
      label: 'Not reachable',
      detail: NOT_REACHABLE_DETAIL,
    };
  }
  return {
    state: 'unavailable',
    label:
      error instanceof TransportError && error.code === 'incompatible_capabilities'
        ? 'Incompatible'
        : 'Not reachable',
    detail: error instanceof Error ? error.message : NOT_REACHABLE_DETAIL,
    diagnostics:
      error instanceof TransportError && error.details
        ? JSON.stringify(error.details, null, 2)
        : undefined,
  };
}
