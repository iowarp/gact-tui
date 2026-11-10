import { TransportError } from '@clio/core/v3';

/** Where a list stands while it has nothing to show: loading, failed or settled. */
export interface ListState {
  /** The first page is on its way and nothing is listed yet. */
  loading: boolean;
  /** The list could not be read, and nothing is listed. */
  error?: unknown;
  retry: () => void;
}

interface ListQuery {
  data: unknown;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
}

/**
 * One state for a list read from one or more queries (the first with data
 * wins): loading only before any data, failed only when none arrived.
 */
export function listState(...queries: readonly ListQuery[]): ListState {
  const retry = () => {
    for (const query of queries) if (query.isError) void query.refetch();
  };
  if (queries.some((query) => query.data !== undefined)) return { loading: false, retry };
  const failed = queries.find((query) => query.isError);
  return {
    loading: !failed && queries.some((query) => query.isLoading),
    error: failed?.error ?? undefined,
    retry,
  };
}

/** The service could not be reached at all (no HTTP status), or the browser is offline. */
export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  return error instanceof TransportError && error.status === undefined;
}
