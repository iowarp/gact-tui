import type {
  ClioRepository,
  ContainerRuntimeFact,
  CreateInfrastructureTargetInput,
  InfrastructureOperation,
  InfrastructureTarget,
  SavedServer,
  ServerParameter,
  TargetFacts,
} from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import type { SavedSshRoute } from '@/lib/connection';
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

/** The SSH host shape `sshTargetDefinition` and `savedSshRoute` both need. */
type SshRouteFields = Pick<
  SshHost,
  | 'label'
  | 'installRoot'
  | 'profile'
  | 'host'
  | 'user'
  | 'port'
  | 'jumpHosts'
  | 'identityFile'
  | 'platform'
>;

/** Build the infrastructure target request an SSH host's deploy registers. */
export function sshTargetDefinition(host: SshRouteFields): CreateInfrastructureTargetInput {
  return {
    kind: 'ssh',
    label: host.label,
    // Saved OpenSSH profiles come from the desktop's Rust bridge, whose
    // optional fields round-trip as `null` when unset; the backend stores
    // plain strings, so a bare `null` fails request validation (#1438).
    install_root: host.installRoot || '',
    ssh: {
      profile: host.profile ?? '',
      host: host.host ?? '',
      user: host.user ?? '',
      port: host.port,
      jump_hosts: host.jumpHosts ?? [],
      identity_file: host.identityFile ?? '',
      platform: host.platform,
    },
  };
}

/** The route a deployed target is saved with, so it can be rebuilt later. */
export function savedSshRoute(host: SshRouteFields): SavedSshRoute {
  return {
    label: host.label,
    installRoot: host.installRoot || '',
    profile: host.profile ?? '',
    host: host.host ?? '',
    user: host.user ?? '',
    port: host.port,
    jumpHosts: host.jumpHosts ?? [],
    identityFile: host.identityFile ?? '',
    platform: host.platform ?? 'auto',
  };
}

/**
 * A `clio_agent` install/start found a healthy CLIO already running --
 * a different install root or version than this desktop would use -- and
 * left it alone rather than silently stopping it (#1528). The caller
 * re-issues the action with `configuration.on_conflict` set to `"connect"`
 * (adopt it as-is) or `"replace"` (stop it and install this version).
 */
export class VersionConflictError extends Error {
  constructor(
    public readonly installedVersion: string,
    public readonly pid: string,
    public readonly health: 'healthy' | 'unresponsive' | 'unknown' = 'unknown',
  ) {
    super(
      health === 'healthy'
        ? `${vocab.agent} ${installedVersion} is already running (pid ${pid}).`
        : `A ${vocab.agent}-looking process (pid ${pid}) is on the port but isn't answering.`,
    );
    this.name = 'VersionConflictError';
  }
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
      if (operation.error === 'clio_deploy_version_conflict' && operation.conflict) {
        throw new VersionConflictError(
          operation.conflict.installed_version,
          operation.conflict.pid,
          operation.conflict.health,
        );
      }
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

export const RUNTIME_NAMES: Record<ContainerRuntimeFact['name'], string> = {
  docker: 'Docker',
  podman: 'Podman',
  apptainer: 'Apptainer',
};

const OS_NAMES: Record<string, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
};

const ARCH_NAMES: Record<string, string> = {
  x86_64: '64-bit',
  aarch64: '64-bit ARM',
};

const GPU_NAMES: Record<string, string> = {
  nvidia: 'NVIDIA GPU detected.',
  amd: 'AMD GPU detected.',
};

/** One plain sentence about the inspected computer, e.g. "Windows, 64-bit. No GPU detected." */
export function hostSummary(facts: TargetFacts): string {
  const system = OS_NAMES[facts.os] ?? 'Unknown system';
  const arch = ARCH_NAMES[facts.arch];
  const gpu = GPU_NAMES[facts.accelerator] ?? 'No GPU detected.';
  return `${arch ? `${system}, ${arch}` : system}. ${gpu}`;
}

export interface RuntimeFactLine {
  name: ContainerRuntimeFact['name'];
  /** What the person reads. */
  text: string;
  /** The runtime's own error, shown only behind a details disclosure. */
  detail: string;
}

/** What starting a stopped runtime means on this computer. */
function startHint(name: ContainerRuntimeFact['name'], os: string): string {
  if (name === 'docker') {
    return os === 'linux'
      ? ' Start the Docker service, then check again.'
      : ' Start Docker Desktop, then check again.';
  }
  return name === 'podman' ? ' Start Podman, then check again.' : '';
}

function unusableText(fact: ContainerRuntimeFact, os: string): string {
  const label = RUNTIME_NAMES[fact.name];
  switch (fact.failure) {
    case 'not_running':
      return `${label} is installed but not running.${startHint(fact.name, os)}`;
    case 'permission_denied':
      return `${label} is installed but your account is not allowed to use it.`;
    case 'timed_out':
      return `${label} is installed but did not respond. Check again in a moment.`;
    default:
      return `${label} is installed but is not working.`;
  }
}

/**
 * One plain sentence per container runtime the target reported: ready,
 * installed but not usable (and what to do), or not installed. Hosts inspected
 * by an older CLIO report only Docker's two flags.
 */
export function runtimeFactLines(facts: TargetFacts): RuntimeFactLine[] {
  // Mocked or older catalogs may omit the list; treat that as "reported only Docker".
  const runtimes: ContainerRuntimeFact[] = facts.container_runtimes ?? [];
  if (!runtimes.length) {
    return [
      {
        name: 'docker',
        text: facts.docker_available
          ? 'Docker is ready.'
          : facts.docker_installed
            ? 'Docker is installed but not running.'
            : 'Docker is not installed.',
        detail: '',
      },
    ];
  }
  return runtimes.map((fact) => ({
    name: fact.name,
    text: fact.usable
      ? `${[RUNTIME_NAMES[fact.name], fact.version].filter(Boolean).join(' ')} is ready.`
      : fact.installed
        ? unusableText(fact, facts.os)
        : `${RUNTIME_NAMES[fact.name]} is not installed.`,
    detail: fact.usable ? '' : fact.detail,
  }));
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
