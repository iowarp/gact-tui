import {
  PROTOCOL_VERSION,
  TransportError,
  type CapabilityNegotiation,
  type ClioRepository,
} from '@clio/core/v3';
import { FAILED_START_DETAIL } from '@/hooks/use-connection-availability';
import { connectionCapabilities } from '@/lib/connection-capabilities';
import { ServiceVersionError } from '@/lib/service-version-error';

/**
 * Whether a service can be opened now, before any workspace is read. It must speak this
 * protocol and be ready. A service still starting throws `task_runtime_starting`, which
 * the page waits out. A failed start throws `task_runtime_unavailable` with the
 * service's own message, because it will not become ready by itself.
 */
export async function assertServiceOpenable(
  repository: Pick<ClioRepository, 'capabilities' | 'serviceHealth'>,
  endpoint: string,
): Promise<CapabilityNegotiation> {
  const [capabilities, health] = await Promise.all([
    connectionCapabilities(repository, endpoint),
    // Older services have no readiness field; an unreadable health is not a failure here.
    Promise.resolve()
      .then(() => repository.serviceHealth())
      .catch(() => undefined),
  ]);
  if (!capabilities.gact_versions.includes(PROTOCOL_VERSION)) {
    throw new ServiceVersionError(PROTOCOL_VERSION, capabilities.gact_versions);
  }
  if (health?.readiness === 'failed') {
    throw new TransportError(
      health.failure?.message || FAILED_START_DETAIL,
      503,
      'task_runtime_unavailable',
      { readiness: 'failed', ...(health.failure ? { reason: health.failure.reason } : {}) },
    );
  }
  if (health?.readiness === 'starting') {
    // Reading workspaces now only earns a 503; wait for readiness (#739 B1).
    throw new TransportError('The service is still starting.', 503, 'task_runtime_starting', {
      readiness: 'starting',
      ...(health.starting ? { starting: health.starting } : {}),
    });
  }
  return capabilities;
}
