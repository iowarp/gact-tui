import { PROTOCOL_VERSION, TransportError } from '@clio/core/v3';
import { useQueries } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { createRepository, type ConnectionSettings, type SavedConnection } from '@/lib/connection';
import { ServiceVersionError } from '@/lib/service-version-error';
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

/** What was actually observed when a service could not be opened. */
export type UnavailableReason = 'no-answer' | 'timeout' | 'incompatible' | 'error' | 'failed';

export interface ConnectionAvailability {
  state: ConnectionAvailabilityState;
  label: string;
  detail: string;
  diagnostics?: string;
  /** Why an `unavailable` service cannot be opened. */
  reason?: UnavailableReason;
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

  const fresh = useMemo(
    () =>
      connections.map((connection, index) => ({
        endpoint: connection.endpoint,
        availability: queries[index]?.data ?? availabilityFromError(queries[index]?.error),
      })),
    [connections, queries],
  );
  // A re-probe of a service that never answered clears the query's error, so
  // keep showing the last settled answer instead of flashing back to Checking.
  const [settled, setSettled] = useState<ConnectionAvailabilityMap>({});
  const answers = fresh.filter(
    ({ endpoint, availability }) =>
      availability !== CHECKING_CONNECTION && !sameAvailability(settled[endpoint], availability),
  );
  if (answers.length > 0) {
    setSettled({
      ...settled,
      ...Object.fromEntries(answers.map(({ endpoint, availability }) => [endpoint, availability])),
    });
  }
  return useMemo(
    () =>
      Object.fromEntries(
        fresh.map(({ endpoint, availability }) => [
          endpoint,
          availability === CHECKING_CONNECTION ? (settled[endpoint] ?? availability) : availability,
        ]),
      ),
    [fresh, settled],
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
      return unavailableFromError(
        new ServiceVersionError(PROTOCOL_VERSION, capabilities.gact_versions),
      );
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

/** The probe gave up waiting: something may be listening, but it did not answer. */
export class ServiceTimeoutError extends Error {
  constructor() {
    super('The service did not respond in time.');
    this.name = 'ServiceTimeoutError';
  }
}

function rethrowCancelledProbe(
  error: unknown,
  requestSignal: AbortSignal,
  probeSignal: AbortSignal,
): void {
  if (requestSignal.aborted) throw error;
  if (probeSignal.aborted) throw new ServiceTimeoutError();
}

function sameAvailability(
  left: ConnectionAvailability | undefined,
  right: ConnectionAvailability,
): boolean {
  return (
    left?.state === right.state &&
    left.label === right.label &&
    left.detail === right.detail &&
    left.diagnostics === right.diagnostics &&
    left.reason === right.reason
  );
}

function availabilityFromError(error: unknown): ConnectionAvailability {
  if (!error || (error instanceof Error && error.name === 'AbortError')) {
    return CHECKING_CONNECTION;
  }
  return unavailableFromError(error);
}

/**
 * An unavailable service, labelled by what actually happened: nothing answered, it did
 * not answer in time, it is a different version, or it answered with an error. The
 * primary text stays plain; protocol versions and raw errors go to `diagnostics`.
 */
export function unavailableFromError(error: unknown): ConnectionAvailability {
  if (error instanceof TransportError && error.code === 'network_unavailable') {
    return {
      state: 'unavailable',
      label: 'Not reachable',
      detail: NOT_REACHABLE_DETAIL,
      reason: 'no-answer',
    };
  }
  if (error instanceof ServiceTimeoutError) {
    return {
      state: 'unavailable',
      label: 'Not responding',
      detail: error.message,
      reason: 'timeout',
    };
  }
  if (error instanceof ServiceVersionError) {
    return {
      state: 'unavailable',
      label: 'Incompatible',
      detail: error.message,
      diagnostics: JSON.stringify(error.details, null, 2),
      reason: 'incompatible',
    };
  }
  if (error instanceof TransportError && error.code === 'incompatible_capabilities') {
    return {
      state: 'unavailable',
      label: 'Incompatible',
      detail: new ServiceVersionError(PROTOCOL_VERSION, []).message,
      diagnostics: JSON.stringify({ message: error.message, details: error.details }, null, 2),
      reason: 'incompatible',
    };
  }
  if (error instanceof TransportError && error.status !== undefined) {
    return {
      state: 'unavailable',
      label: 'Service error',
      detail: error.message || 'The service reported an error.',
      diagnostics: JSON.stringify(
        { status: error.status, code: error.code, details: error.details },
        null,
        2,
      ),
      reason: 'error',
    };
  }
  return {
    state: 'unavailable',
    label: 'Not available',
    detail: error instanceof Error && error.message ? error.message : NOT_REACHABLE_DETAIL,
    diagnostics:
      error instanceof TransportError && error.details
        ? JSON.stringify(error.details, null, 2)
        : undefined,
    reason: 'failed',
  };
}
