import type { ManagedTargetInput, SshProfile } from '@/tauri/infrastructure-setup';

const SAVED_SSH_HOSTS_KEY = 'clio.saved-ssh-hosts.v1';
const SAVED_SSH_HOSTS_LIMIT = 24;

export type SshHost = {
  id: string;
  label: string;
  profile?: string;
  host?: string;
  user?: string;
  port: number;
  identityFile?: string;
  authMethod?: 'key' | 'password';
  credentialId?: string;
  installRoot?: string;
};

function cleanOptional(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function validPort(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65_535
    ? value
    : 22;
}

function parseSavedHost(value: unknown): SshHost | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const item = value as Record<string, unknown>;
  const id = cleanOptional(item.id);
  const label = cleanOptional(item.label);
  const host = cleanOptional(item.host);
  if (!id || !label || !host) return undefined;
  return {
    id,
    label,
    host,
    user: cleanOptional(item.user),
    port: validPort(item.port),
    identityFile: cleanOptional(item.identityFile),
    authMethod: item.authMethod === 'password' ? 'password' : 'key',
    credentialId: cleanOptional(item.credentialId) ?? id,
    installRoot: cleanOptional(item.installRoot),
  };
}

/** Read manually saved SSH hosts. Authentication secrets are never stored here. */
export function readSavedSshHosts(): SshHost[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(SAVED_SSH_HOSTS_KEY) ?? '[]') as unknown;
    return Array.isArray(value)
      ? value.flatMap((item) => {
          const parsed = parseSavedHost(item);
          return parsed ? [parsed] : [];
        })
      : [];
  } catch {
    return [];
  }
}

/** Persist one manual SSH host without replacing profiles imported from OpenSSH. */
export function saveSshHost(host: SshHost): SshHost[] {
  const saved = [host, ...readSavedSshHosts().filter((item) => item.id !== host.id)].slice(
    0,
    SAVED_SSH_HOSTS_LIMIT,
  );
  window.localStorage.setItem(SAVED_SSH_HOSTS_KEY, JSON.stringify(saved));
  return saved;
}

/** Convert OpenSSH config entries into the same picker model as manual hosts. */
export function profileSshHosts(profiles: readonly SshProfile[]): SshHost[] {
  return profiles.map((profile) => ({
    id: `profile:${profile.name}`,
    label: profile.name,
    profile: profile.name,
    host: profile.hostname,
    user: profile.user,
    port: 22,
  }));
}

/** Build the native deployment target without shell-composed user input. */
export function sshHostTarget(host: SshHost): ManagedTargetInput {
  return {
    target: 'ssh',
    ...(host.profile ? { ssh_profile: host.profile } : {}),
    ...(host.host ? { ssh_host: host.host } : {}),
    ...(host.user ? { ssh_user: host.user } : {}),
    ...(host.port !== 22 ? { ssh_port: host.port } : {}),
    ...(host.identityFile ? { ssh_identity_file: host.identityFile } : {}),
    ...(host.installRoot ? { install_root: host.installRoot } : {}),
    ssh_auth_method: host.authMethod ?? 'key',
    ssh_credential_id: host.credentialId ?? host.id,
  };
}

export function sshHostDestination(host: SshHost): string {
  if (host.profile) return host.profile;
  return `${host.user ? `${host.user}@` : ''}${host.host ?? ''}`;
}

export function createSavedSshHost(input: {
  host: string;
  identityFile?: string;
  authMethod?: 'key' | 'password';
  label?: string;
  installRoot?: string;
  port?: number;
  user?: string;
}): SshHost {
  const address = input.host.trim();
  if (!address) throw new Error('Enter the SSH host address.');
  const port = validPort(input.port);
  const user = cleanOptional(input.user);
  const destination = `${user ? `${user}@` : ''}${address}`;
  return {
    id: `manual:${destination}:${port}`,
    label: cleanOptional(input.label) ?? destination,
    host: address,
    user,
    port,
    identityFile: cleanOptional(input.identityFile),
    authMethod: input.authMethod ?? 'key',
    credentialId: `manual:${destination}:${port}`,
    installRoot: cleanOptional(input.installRoot),
  };
}
