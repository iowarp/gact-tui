import type { ManagedServiceDefinition } from '@clio/core/v3';
import { managedServiceStatus } from '@/lib/managed-service-status';
import { engineId } from './managed-service-gpus';
import type { StatusTone } from './primitives/status-indicator';

/** The plain sentence behind the ⓘ beside a service's name. */
export function serviceAbout(service: ManagedServiceDefinition, variant: string) {
  const native = service.variants.some(
    (row) => row.id === variant && row.install_type === 'native_uv',
  );
  return [
    service.description,
    engineId(service) === 'llama_cpp'
      ? 'Install prepares the runtime without loading a model. Start loads the selected model.'
      : '',
    native
      ? 'Install prepares the pinned environment. Start loads the model. Removal retains models and evidence.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export const STATUS_TONE: Record<ReturnType<typeof managedServiceStatus>['kind'], StatusTone> = {
  running: 'success',
  starting: 'running',
  installing: 'running',
  stopped: 'stopped',
  not_installed: 'warning',
  unavailable: 'idle',
  not_checked: 'idle',
};

export function portOf(url?: string) {
  if (!url) return undefined;
  try {
    return new URL(url).port || undefined;
  } catch {
    return undefined;
  }
}
