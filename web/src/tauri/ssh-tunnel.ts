import type { SshHost } from '@/lib/ssh-hosts';
import { inTauri } from '@/lib/transport/tauri-runtime';

export type SshTunnelSettings = {
  host: string;
  user: string;
  remote_port: number;
  key_path: string;
  profile?: string;
  port?: number;
  local_port?: number;
  auth_method?: 'key' | 'password';
  credential_id?: string;
};

export type SshTunnelHandle = {
  local_url: string;
  local_port: number;
};

/** Describe an SSH tunnel without retaining passwords or other secrets. */
export function sshTunnelForHost(
  host: SshHost,
  remotePort: number,
  localPort?: number,
): SshTunnelSettings {
  return {
    host: host.host ?? '',
    user: host.user ?? '',
    remote_port: remotePort,
    key_path: host.identityFile ?? '',
    ...(host.profile ? { profile: host.profile } : {}),
    ...(host.port !== 22 ? { port: host.port } : {}),
    ...(localPort ? { local_port: localPort } : {}),
    auth_method: host.authMethod ?? 'key',
    credential_id: host.credentialId ?? host.id,
  };
}

/** Open or reuse a native SSH tunnel owned by the desktop lifecycle. */
export async function openSshTunnel(request: SshTunnelSettings): Promise<SshTunnelHandle> {
  if (!inTauri()) throw new Error('SSH tunnels are available in the installed desktop app.');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<SshTunnelHandle>('tunnel_open', { request });
}
