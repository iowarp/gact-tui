import type { ServiceObservation } from '@clio/core/v3';
import type { ClioStatusValue } from '@/components/clio/status';

/** What a managed service is, from the one record every Infrastructure surface reads. */
export type ManagedServiceStatusKind =
  | 'running'
  | 'starting'
  | 'installing'
  | 'stopped'
  | 'not_installed'
  | 'unavailable'
  | 'not_checked';

export interface ManagedServiceStatus {
  kind: ManagedServiceStatusKind;
  /** The words shown beside the service, never a bare color. */
  label: string;
  value: ClioStatusValue;
  /** The one lifecycle action that moves it forward, when there is one. */
  action?: 'install' | 'start';
  /** Why it is in this state, when the record says. */
  reason?: string;
}

export interface ManagedServiceStatusSource {
  state: string;
  observation?: ServiceObservation;
  /** Catalog rows only: offered variants and what this deployment created. */
  variants?: readonly { compatible: boolean }[];
  owned_resources?: readonly unknown[];
}

/**
 * Derive a service's state the same way on Overview, Services and its management panel.
 *
 * The computer's observation wins over the coarse `state`: an install that failed
 * leaves `installed: false` whatever phase the supervisor last wrote, and that is
 * "Not installed" (install it), not "stopped" (start it) or "not checked".
 */
export function managedServiceStatus(service: ManagedServiceStatusSource): ManagedServiceStatus {
  const observed = service.observation;
  if (observed) {
    if (observed.serving) return { kind: 'running', label: 'Running', value: 'healthy' };
    if (observed.phase === 'installing')
      return { kind: 'installing', label: 'Installing', value: 'running' };
    if (observed.running) return { kind: 'starting', label: 'Starting', value: 'running' };
    if (observed.installed)
      return { kind: 'stopped', label: 'Stopped', value: 'degraded', action: 'start' };
    return notInstalled(observed.error);
  }
  if (service.state === 'running') return { kind: 'running', label: 'Running', value: 'healthy' };
  if (service.state === 'stopped')
    return { kind: 'stopped', label: 'Stopped', value: 'degraded', action: 'start' };
  if (service.state === 'not_installed') return notInstalled();
  // A catalog entry with no deployment: whether this computer can take one.
  if (service.variants && !service.owned_resources?.length) {
    return service.variants.some((row) => row.compatible)
      ? { kind: 'not_installed', label: 'Not installed', value: 'unavailable', action: 'install' }
      : { kind: 'unavailable', label: 'Unavailable here', value: 'unavailable' };
  }
  return { kind: 'not_checked', label: 'Not checked', value: 'unavailable' };
}

function notInstalled(error?: string | null): ManagedServiceStatus {
  return {
    kind: 'not_installed',
    label: 'Not installed',
    value: 'degraded',
    action: 'install',
    reason: error ? 'The last installation did not finish. Install it to use it.' : undefined,
  };
}
