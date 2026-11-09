import { TransportError } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { KnownConnection } from '@/hooks/use-known-connections';
import {
  NOT_REACHABLE_DETAIL,
  probeConnection,
  type ConnectionAvailability,
} from '@/hooks/use-connection-availability';
import { normalizeEndpoint, type ConnectionSettings } from '@/lib/connection';
import { queryKeys } from '@/lib/query-keys';
import {
  CONNECTION_RETRY_MAX_MS,
  CONNECTION_RETRY_MIN_MS,
  CONNECTION_WAIT_FOR_START_MS,
} from '@/lib/runtime-limits';

/** The connect attempt as the page's mutation exposes it. */
export interface ConnectAttempt {
  isError: boolean;
  isPending: boolean;
  error: Error | null;
  variables?: ConnectionSettings;
  submittedAt: number;
  mutate: (settings: ConnectionSettings) => void;
}

function attemptedEndpoint(attempt: ConnectAttempt): string | undefined {
  if (!attempt.variables) return undefined;
  try {
    return normalizeEndpoint(attempt.variables.endpoint);
  } catch {
    return undefined;
  }
}

function reachable(availability: ConnectionAvailability | undefined): boolean {
  return availability?.state === 'healthy' || availability?.state === 'degraded';
}

/** A service that neither answers nor reports it is starting: it cannot be opened yet. */
export function availabilityFailed(availability: ConnectionAvailability | undefined): boolean {
  return availability?.state === 'unavailable' && !availability.starting;
}

/**
 * A row's badge after a connect attempt. A failed attempt is the row's state only until
 * the background probe has news: a service that answers (or reports it is starting)
 * shows that, not the older failure.
 */
export function availabilityAfterAttempt(
  connection: KnownConnection,
  attempt: ConnectAttempt,
): ConnectionAvailability {
  if (!attempt.isError || attemptedEndpoint(attempt) !== connection.endpoint) {
    return connection.availability;
  }
  if (reachable(connection.availability) || connection.availability.starting) {
    return connection.availability;
  }
  return {
    state: 'unavailable',
    label: 'Not reachable',
    detail: attempt.error?.message || NOT_REACHABLE_DETAIL,
  };
}

/** The connect attempt's error, when that attempt was for this service. */
export function attemptErrorFor(
  connection: KnownConnection,
  attempt: ConnectAttempt,
): Error | undefined {
  return attempt.isError && attemptedEndpoint(attempt) === connection.endpoint
    ? (attempt.error ?? undefined)
    : undefined;
}

/** Nothing answered at the address, as opposed to a service that answered with a refusal. */
export function noAnswer(error: Error | null | undefined): boolean {
  return error instanceof TransportError && error.code === 'network_unavailable';
}

/**
 * A failed service row's one line. When the attempt's own error line already says why
 * (a refused token, an incompatible protocol), the row keeps to its short state.
 */
export function knownServiceFailure(
  connection: KnownConnection,
  availability: ConnectionAvailability,
  attempt: ConnectAttempt,
): string {
  const error = attemptErrorFor(connection, attempt);
  if (error && !noAnswer(error)) return availability.label;
  if (availability.label === 'Not reachable') {
    return `Can't connect: no answer from ${new URL(connection.endpoint).host}`;
  }
  return `Can't connect: ${availability.detail}`;
}

function reportedReadiness(details: unknown): unknown {
  return details && typeof details === 'object'
    ? (details as { readiness?: unknown }).readiness
    : undefined;
}

/**
 * The service answered but is still bringing up its task runtime: a `/v1/*` 503
 * (`task_runtime_starting`, `details.readiness: "starting"`). A 503 whose readiness is
 * `failed` (`task_runtime_unavailable`) is a failure, not a start.
 */
export function serviceStillStarting(error: Error | null | undefined): boolean {
  if (!(error instanceof TransportError)) return false;
  const readiness = reportedReadiness(error.details);
  if (readiness === 'failed' || error.code === 'task_runtime_unavailable') return false;
  return error.status === 503 || error.code === 'task_runtime_starting' || readiness === 'starting';
}

/**
 * Delay before automatic connect retry number `retry` (0-based): 250 ms doubling to 2 s,
 * never sooner than the service's own `Retry-After`.
 */
export function connectRetryDelayMs(retry: number, retryAfterMs = 0): number {
  const backoff = Math.min(
    CONNECTION_RETRY_MAX_MS,
    CONNECTION_RETRY_MIN_MS * 2 ** Math.max(0, retry),
  );
  return Math.max(backoff, retryAfterMs);
}

/**
 * One run of automatic retries. Retries resend the failed attempt's own `variables`, so
 * a new `variables` object is a new attempt by the person (or auto-connect) and starts a
 * new chain with a fresh waiting window and backoff.
 */
interface RetryChain {
  variables: ConnectionSettings;
  startedAt: number;
  retries: number;
}

/**
 * Whether a failed attempt is a service still coming up rather than a failure: it is
 * starting (503 `task_runtime_starting`, or its probe says so). The page then waits and
 * connects by itself instead of showing an error. A service that has not answered yet is
 * shown as a failure but is still retried once its probe sees it answer. Only those
 * transient failures are retried, after a backoff that
 * honours the service's `Retry-After` and within `CONNECTION_WAIT_FOR_START_MS` of the
 * chain's first failure; anything else (an
 * incompatible protocol, a rejected token) is shown once.
 *
 * `retrying` is true while a retry is scheduled, so a boot screen can stay up between
 * attempts instead of flashing the form.
 */
export function useConnectionWaiting(
  attempt: ConnectAttempt,
  known: readonly KnownConnection[],
): { waiting: boolean; retrying: boolean; availability?: ConnectionAvailability } {
  const { error, isError, isPending, mutate, submittedAt, variables } = attempt;
  const endpoint = isError ? attemptedEndpoint(attempt) : undefined;
  const availability = known.find((connection) => connection.endpoint === endpoint)?.availability;
  const starting = isError && serviceStillStarting(error);
  const notAnswered =
    isError && error instanceof TransportError && error.code === 'network_unavailable';
  const transient = starting || notAnswered;

  const [chain, setChain] = useState<RetryChain | null>(null);
  if (isError && variables && chain?.variables !== variables) {
    setChain({ variables, startedAt: submittedAt, retries: 0 });
  }
  const current = chain && variables && chain.variables === variables ? chain : undefined;
  const expired = useWaitExpired(isError ? (current?.startedAt ?? submittedAt) : null);
  const canRetry = transient && (starting || reachable(availability)) && !expired;
  const delayMs = connectRetryDelayMs(
    current?.retries ?? 0,
    error instanceof TransportError ? error.retryAfterMs : undefined,
  );
  const retried = useRef<number | null>(null);

  useEffect(() => {
    if (!endpoint || !variables || isPending || !canRetry) return;
    if (retried.current === submittedAt) return; // once per failed attempt
    const timer = globalThis.setTimeout(() => {
      retried.current = submittedAt;
      setChain((previous) =>
        previous?.variables === variables
          ? { ...previous, retries: previous.retries + 1 }
          : previous,
      );
      mutate(variables);
    }, delayMs);
    return () => globalThis.clearTimeout(timer);
  }, [canRetry, delayMs, endpoint, isPending, mutate, submittedAt, variables]);

  if (!endpoint) return { waiting: false, retrying: false };
  return {
    // Only a service that says it is starting is waited on visibly. One that has not
    // answered is a failure with Retry, even though it still opens by itself if it
    // comes up within the waiting window.
    waiting: Boolean(availability?.starting) || (starting && !expired),
    retrying: Boolean(variables) && canRetry,
    availability,
  };
}

/**
 * Whether the agent that served this page answers at its own origin (#739 B7). An
 * agent-served page with nothing remembered then connects by itself; when nothing
 * answers the person gets the manual form. A service still starting counts as answered.
 */
export function useServedEndpointProbe(endpoint: string | undefined): {
  pending: boolean;
  answered: boolean;
} {
  const probe = useQuery({
    queryKey: queryKeys.key('served-endpoint-probe', endpoint ?? ''),
    queryFn: async ({ signal }) => {
      try {
        const availability = await probeConnection({ endpoint: endpoint ?? '' }, signal);
        return availability.state !== 'unavailable';
      } catch (error) {
        return serviceStillStarting(error as Error);
      }
    },
    enabled: Boolean(endpoint),
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });
  return {
    pending: Boolean(endpoint) && probe.isPending,
    answered: Boolean(endpoint) && probe.data === true,
  };
}

/** True once a failed attempt is older than the waiting window (a timer, not a clock read). */
function useWaitExpired(failedAt: number | null): boolean {
  const [expiredFor, setExpiredFor] = useState<number | null>(null);
  useEffect(() => {
    if (failedAt === null) return;
    const timer = globalThis.setTimeout(
      () => setExpiredFor(failedAt),
      CONNECTION_WAIT_FOR_START_MS,
    );
    return () => globalThis.clearTimeout(timer);
  }, [failedAt]);
  return failedAt !== null && expiredFor === failedAt;
}
