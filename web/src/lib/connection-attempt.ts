import { TransportError } from '@clio/core/v3';
import { useEffect, useRef, useState } from 'react';
import type { KnownConnection } from '@/hooks/use-known-connections';
import {
  NOT_REACHABLE_DETAIL,
  type ConnectionAvailability,
} from '@/hooks/use-connection-availability';
import { normalizeEndpoint, type ConnectionSettings } from '@/lib/connection';
import { CONNECTION_WAIT_FOR_START_MS } from '@/lib/runtime-limits';

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

/**
 * Whether a failed attempt is a service still coming up rather than a failure: it is
 * starting, or nothing has answered yet and the attempt is recent. The page then waits
 * and connects by itself instead of showing an error.
 */
export function useConnectionWaiting(
  attempt: ConnectAttempt,
  known: readonly KnownConnection[],
): { waiting: boolean; availability?: ConnectionAvailability } {
  const endpoint = attempt.isError ? attemptedEndpoint(attempt) : undefined;
  const availability = known.find((connection) => connection.endpoint === endpoint)?.availability;
  const retried = useRef<number | null>(null);

  useEffect(() => {
    if (!endpoint || !attempt.variables || attempt.isPending || !reachable(availability)) return;
    if (retried.current === attempt.submittedAt) return; // once per failed attempt
    retried.current = attempt.submittedAt;
    attempt.mutate(attempt.variables);
  }, [attempt, availability, endpoint]);

  const expired = useWaitExpired(attempt.isError ? attempt.submittedAt : null);
  if (!endpoint) return { waiting: false };
  const notAnswered =
    attempt.error instanceof TransportError && attempt.error.code === 'network_unavailable';
  return {
    waiting: Boolean(availability?.starting) || (notAnswered && !expired),
    availability,
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
