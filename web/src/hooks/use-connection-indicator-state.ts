import type { StreamState } from '@clio/core/v3';
import { useWorkspaceCapabilities } from '@/hooks/use-workspace-capabilities';
import { CONNECTION_PROBE_POLL_MS } from '@/lib/runtime-limits';
import { useLiveStore } from '@/store/live-store';

export type ServiceReachability = 'checking' | 'reachable' | 'unreachable';

/**
 * What the live-connection indicator shows. An open session event stream is the
 * authority on its own route. With none open (Settings, and any route that has
 * no focused session) `entities.stream` is whatever the last stream left behind,
 * or the initial "offline", so the indicator reads the service probe instead:
 * the same `/v1/capabilities` call every surface already uses to reach the
 * service.
 */
export function connectionIndicatorState(input: {
  streamOwned: boolean;
  stream: StreamState;
  service: ServiceReachability;
}): StreamState {
  if (input.streamOwned) return input.stream;
  if (input.service === 'reachable') return 'live';
  if (input.service === 'unreachable') return 'offline';
  return 'connecting';
}

/** The indicator's state on the current route; polls the service while no stream is open. */
export function useConnectionIndicatorState(): StreamState {
  const streamOwned = useLiveStore((state) => state.streamOwners > 0);
  const stream = useLiveStore((state) => state.entities.stream);
  // Only a route without its own stream needs the probe to notice a drop.
  const { capabilities } = useWorkspaceCapabilities({
    pollMs: streamOwned ? false : CONNECTION_PROBE_POLL_MS,
  });
  const service: ServiceReachability = capabilities.isError
    ? 'unreachable'
    : capabilities.isSuccess
      ? 'reachable'
      : 'checking';
  return connectionIndicatorState({ streamOwned, stream, service });
}
