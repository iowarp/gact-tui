import type { ClioRepository, InfrastructureTarget } from '@clio/core/v3';
import type { ConnectionSettings } from '@/lib/connection';
import type { SshHost } from '@/lib/ssh-hosts';
import {
  attachInfrastructureSshTransport,
  sshTransportStatus,
  type SshTransportStatus,
} from '@/tauri/ssh-infrastructure-transport';
import {
  abortableDelay,
  sshTargetDefinition,
  targetMatchesHost,
} from './managed-service-target-utils';

/** Register the same durable host identity for deployment and connected folders. */
export async function registerSshTarget(
  repository: ClioRepository,
  host: SshHost,
): Promise<InfrastructureTarget> {
  const targets = await repository.infrastructureTargets();
  const definition = sshTargetDefinition(host);
  const existing = targets.find(
    (candidate) =>
      targetMatchesHost(candidate, host) && candidate.install_root === (host.installRoot || ''),
  );
  return existing
    ? repository.updateInfrastructureTarget(existing.id, definition)
    : repository.createInfrastructureTarget(definition);
}

/** Authenticate through Desktop's existing OpenSSH session, then confirm its CLIO bridge. */
export async function connectSshTarget(
  repository: ClioRepository,
  settings: ConnectionSettings,
  target: InfrastructureTarget,
  signal: AbortSignal,
  observe: (status: SshTransportStatus) => void,
): Promise<SshTransportStatus> {
  signal.throwIfAborted();
  // Durable target state is not proof this Desktop has attached its execution bridge.
  let status = await attachInfrastructureSshTransport(settings.endpoint, settings.token, target);
  signal.throwIfAborted();
  observe(status);
  while (status.state !== 'connected') {
    if (status.state === 'disconnected') {
      throw new Error(
        status.failure ||
          `OpenSSH disconnected from ${target.label} before authentication finished.`,
      );
    }
    await abortableDelay(250, signal);
    status = await sshTransportStatus(status.session_id);
    signal.throwIfAborted();
    observe(status);
  }
  // Authentication and WebSocket admission are distinct. Folder browsing needs both.
  status = await attachInfrastructureSshTransport(settings.endpoint, settings.token, target);
  signal.throwIfAborted();
  if (status.state !== 'connected') throw new Error(`SSH connection to ${target.label} was lost.`);
  await repository.setInfrastructureTransportState(target.id, 'connected');
  signal.throwIfAborted();
  observe(status);
  return status;
}
