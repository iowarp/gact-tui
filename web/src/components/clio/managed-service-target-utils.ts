import type {
  ClioRepository,
  ContainerRuntimeFact,
  InfrastructureOperation,
  InfrastructureTarget,
  SavedServer,
  ServerParameter,
  TargetFacts,
} from '@clio/core/v3';
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
  onProgress?: (operation: InfrastructureOperation) => void,
): Promise<InfrastructureOperation> {
  // No client-side deadline: a model download or a CPU model load can take many
  // minutes. The operation ends on the server (or by the person's cancel).
  let operation = initial;
  for (;;) {
    if (operation.state === 'succeeded') return operation;
    if (operation.state === 'failed' || operation.state === 'cancelled') {
      throw new Error(operation.error || operation.progress || `${operation.action} failed.`);
    }
    onProgress?.(operation);
    await abortableDelay(500, signal);
    operation = await repository.infrastructureOperation(operation.id, signal);
  }
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

/**
 * One short line per container runtime the target reported: ready with its
 * version, installed but unusable, or not installed. Hosts inspected by an
 * older CLIO report only Docker.
 */
export function runtimeFactLabels(facts: TargetFacts): string[] {
  const names: Record<ContainerRuntimeFact['name'], string> = {
    docker: 'Docker',
    podman: 'Podman',
    apptainer: 'Apptainer',
  };
  // Mocked or older catalogs may omit the list; treat that as "reported only Docker".
  const runtimes: ContainerRuntimeFact[] = facts.container_runtimes ?? [];
  if (!runtimes.length) {
    return [
      facts.docker_available
        ? 'Docker ready'
        : facts.docker_installed
          ? 'Docker installed, engine stopped'
          : 'Docker not installed',
    ];
  }
  return runtimes.map((fact) =>
    fact.usable
      ? `${names[fact.name]} ${fact.version} ready`.replace('  ', ' ')
      : fact.installed
        ? `${names[fact.name]} unusable${fact.detail ? `: ${shorten(fact.detail)}` : ''}`
        : `${names[fact.name]} not installed`,
  );
}

/** Whether a running model runtime is already the saved address of its Models preset. */
export function modelRuntimeInModels(
  servers: SavedServer[] | undefined,
  serviceId: string,
  connectionUrl: string,
): boolean {
  const root = (address: string) => address.replace(/\/+$/u, '').replace(/\/v1$/u, '');
  return Boolean(
    servers?.some(
      (server) => server.id === serviceId && root(server.address) === root(connectionUrl),
    ),
  );
}

/** Configuration keys that carry a server parameter are `param.<id>` (declared by CLIO). */
export const PARAMETER_PREFIX = 'param.';

/**
 * The form's configuration without server parameters of another variant (a
 * value typed for CUDA stays in the form after switching to CPU, where CLIO
 * would rightly refuse it, but its field is no longer shown to clear).
 */
export function configurationForVariant(
  configuration: Record<string, string>,
  parameters: ServerParameter[],
  variant: string,
): Record<string, string> {
  const shown = new Set(parametersForVariant(parameters, variant).map((row) => row.id));
  return Object.fromEntries(
    Object.entries(configuration).filter(
      ([key]) => !key.startsWith(PARAMETER_PREFIX) || shown.has(key.slice(PARAMETER_PREFIX.length)),
    ),
  );
}

/** The parameters that apply to the chosen installation variant. */
export function parametersForVariant(
  parameters: ServerParameter[],
  variant: string,
): ServerParameter[] {
  return parameters.filter((row) => !row.variants.length || row.variants.includes(variant));
}

/** Keep a runtime's own error readable in the one-line facts row. */
function shorten(text: string, limit = 96): string {
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
