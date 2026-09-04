import { PROTOCOL_VERSION } from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { createRepository, type ConnectionSettings, type SavedConnection } from '@/lib/connection';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  CONNECTION_PROBE_POLL_MS,
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
}

export type ConnectionAvailabilityMap = Readonly<Record<string, ConnectionAvailability>>;

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
      refetchInterval: CONNECTION_PROBE_POLL_MS,
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
        detail: `Requires GACT ${PROTOCOL_VERSION}.`,
      };
    }

    try {
      const health = await repository.serviceHealth(controller.signal);
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
  return {
    state: 'unavailable',
    label: 'Unavailable',
    detail: error instanceof Error ? error.message : 'The service could not be reached.',
  };
}
