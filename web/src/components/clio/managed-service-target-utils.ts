import type { ClioRepository, InfrastructureOperation, InfrastructureTarget } from '@clio/core/v3';
import type { SshHost } from '@/lib/ssh-hosts';
import type { ManagedTargetKind } from './managed-service-target';

export function targetLabel(target: ManagedTargetKind, host?: SshHost): string {
  return target === 'local' ? 'this computer' : host?.label || 'the SSH host';
}

export function targetMatchesHost(target: InfrastructureTarget, host: SshHost): boolean {
  if (target.kind !== 'ssh' || !target.ssh) return false;
  if (host.profile && target.ssh.profile) {
    return host.profile.toLocaleLowerCase() === target.ssh.profile.toLocaleLowerCase();
  }
  return (
    Boolean(host.host && target.ssh.host) &&
    host.host?.toLocaleLowerCase() === target.ssh.host.toLocaleLowerCase() &&
    host.port === target.ssh.port &&
    (host.user ?? '') === target.ssh.user &&
    JSON.stringify(host.jumpHosts ?? []) === JSON.stringify(target.ssh.jump_hosts)
  );
}

export async function waitForOperation(
  repository: Pick<ClioRepository, 'infrastructureOperation'>,
  initial: InfrastructureOperation,
  signal?: AbortSignal,
): Promise<InfrastructureOperation> {
  let operation = initial;
  for (let attempt = 0; attempt < 2_400; attempt += 1) {
    if (operation.state === 'succeeded') return operation;
    if (operation.state === 'failed' || operation.state === 'cancelled') {
      throw new Error(operation.error || operation.progress || `${operation.action} failed.`);
    }
    await abortableDelay(500, signal);
    operation = await repository.infrastructureOperation(operation.id, signal);
  }
  throw new Error(`${initial.action} is still running. Check its status before trying again.`);
}

/** Wait `milliseconds`, rejecting as soon as `signal` aborts. */
export function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const timer = window.setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, milliseconds);
    const aborted = () => {
      window.clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', aborted, { once: true });
  });
}
