import { TransportError } from '@clio/core/v3';

/**
 * Why an A2UI catalog/capabilities request for a session failed to resolve.
 * `useA2uiSessionRegistry` (`processor-store.ts`) classifies every query
 * error into exactly one of these (S1 adversarial follow-up) instead of one
 * blanket "the session server does not support the A2UI catalog registry
 * routes" message, which used to fire for a transient 500 or a malformed
 * response exactly the same as a genuine 404 from an older server.
 */
export type A2uiRegistryFailureReason = 'route_unavailable' | 'decode_failed' | 'network_error';

export type A2uiRegistryFailureCode =
  | 'a2ui_catalog_route_unavailable'
  | 'a2ui_catalog_decode_failed'
  | 'a2ui_catalog_network_error';

export interface A2uiRegistryFailure {
  reason: A2uiRegistryFailureReason;
  code: A2uiRegistryFailureCode;
  detail: string;
}

/** The only two HTTP statuses that mean "this server has no A2UI catalog routes at all." */
const ROUTE_MISSING_STATUSES = new Set([404, 501]);

/**
 * Classifies why an A2UI catalog/capabilities request failed. Only an HTTP
 * 404/501 -- the server genuinely has no A2UI catalog routes -- is
 * `route_unavailable`; every other transport-level failure (a different
 * status such as a transient 500, or no response at all -- offline, DNS,
 * a dropped connection) is `network_error`, which IS worth retrying. A
 * response that arrived and decoded to the wrong shape (the transport's
 * `decode` callback threw, e.g. the top-level `catalogs` field was not even
 * an array) is `decode_failed` and is never worth retrying -- the same
 * bytes will fail to decode again.
 */
export function classifyA2uiRegistryFailure(error: unknown): A2uiRegistryFailure {
  if (error instanceof TransportError) {
    if (error.status !== undefined && ROUTE_MISSING_STATUSES.has(error.status)) {
      return {
        reason: 'route_unavailable',
        code: 'a2ui_catalog_route_unavailable',
        detail: 'The session server does not support the A2UI catalog registry routes.',
      };
    }
    return {
      reason: 'network_error',
      code: 'a2ui_catalog_network_error',
      detail: `The session server's A2UI catalog registry request failed: ${error.message}`,
    };
  }
  const detail = error instanceof Error ? error.message : 'The response could not be parsed.';
  return {
    reason: 'decode_failed',
    code: 'a2ui_catalog_decode_failed',
    detail: `The session server's A2UI catalog registry response could not be parsed: ${detail}`,
  };
}

/** Whether a classified failure is worth retrying -- transient transport failures only. */
export function isA2uiRegistryFailureRetryable(reason: A2uiRegistryFailureReason): boolean {
  return reason === 'network_error';
}

/** The maximum number of automatic retries for a retryable A2UI registry failure. */
export const A2UI_REGISTRY_MAX_RETRIES = 3;

/**
 * The `retry` predicate `useA2uiSessionRegistry`'s catalog/capabilities
 * queries pass to TanStack Query: retries a `network_error` up to
 * {@link A2UI_REGISTRY_MAX_RETRIES} times with the library's own default
 * exponential backoff, instead of an unconditional `retry: false` letting a
 * single transient blip degrade the session for as long as its
 * `staleTime: 60_000` window keeps a plain remount/refocus from refetching.
 * Never retries `route_unavailable` (an older server will not grow the
 * route by waiting) or `decode_failed` (the same bytes will not decode
 * differently on a second try).
 */
export function shouldRetryA2uiRegistryFailure(failureCount: number, error: unknown): boolean {
  const { reason } = classifyA2uiRegistryFailure(error);
  return isA2uiRegistryFailureRetryable(reason) && failureCount < A2UI_REGISTRY_MAX_RETRIES;
}
