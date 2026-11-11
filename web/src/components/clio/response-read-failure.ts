import type { StreamState } from '@clio/core/v3';
import { isOfflineError } from '@/lib/list-state';

/**
 * The read failure worth a "Some responses could not be read" alert. While the
 * service is offline, reconnecting or reopening its stream, the connection status
 * already says why reads fail, and a request that never reached the service is
 * that same outage; neither is a missing response.
 */
export function responseReadFailure(
  error: Error | undefined,
  connection: StreamState,
): Error | undefined {
  if (!error || connection !== 'live' || isOfflineError(error)) return undefined;
  return error;
}
