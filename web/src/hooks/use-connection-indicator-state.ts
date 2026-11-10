import type { StreamState } from '@clio/core/v3';
import { createContext, useContext } from 'react';
import { useWorkspaceCapabilities } from '@/hooks/use-workspace-capabilities';
import { CONNECTION_LOST_PROBE_POLL_MS, CONNECTION_PROBE_POLL_MS } from '@/lib/runtime-limits';
import { useLiveStore } from '@/store/live-store';

/**
 * A fixed state for a scripted surface that has no stream of its own, such as the
 * onboarding tour's practice composer. Real routes never provide it.
 */
export const ConnectionStateOverride = createContext<StreamState | undefined>(undefined);

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
  const override = useContext(ConnectionStateOverride);
  const streamOwned = useLiveStore((state) => state.streamOwners > 0);
  const stream = useLiveStore((state) => state.entities.stream);
  // Only a route without its own stream needs the probe to notice a drop; once it has,
  // it probes faster so the line clears soon after the service is back.
  const { capabilities } = useWorkspaceCapabilities({
    pollMs: streamOwned
      ? false
      : (failed) => (failed ? CONNECTION_LOST_PROBE_POLL_MS : CONNECTION_PROBE_POLL_MS),
  });
  const service: ServiceReachability = capabilities.isError
    ? 'unreachable'
    : capabilities.isSuccess
      ? 'reachable'
      : 'checking';
  return override ?? connectionIndicatorState({ streamOwned, stream, service });
}
