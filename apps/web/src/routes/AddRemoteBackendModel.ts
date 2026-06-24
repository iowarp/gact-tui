/**
 * Form state model for the add-remote-backend wizard (mode, fields, and
 * validation) used by its route view.
 */
import type { BackendEntry } from '@clio/core';

export type RemoteBackendMode = 'http' | 'ssh';

export interface AddRemoteBackendValues {
  mode: RemoteBackendMode;
  label: string;
  url: string;
  token: string;
  sshHost: string;
  sshUser: string;
  sshKey: string;
  sshRemotePort: string;
}

export interface SshTunnelEndpoint {
  localUrl: string;
  localPort?: number;
}

export const DEFAULT_HTTP_BACKEND_URL = 'http://localhost:17800';
export const DEFAULT_SSH_REMOTE_PORT = '17800';
export const INACTIVE_SSH_TUNNEL_URL = 'http://127.0.0.1:0';

export function parseSshRemotePort(value: string): number {
  return Number.parseInt(value.trim(), 10);
}

export function validateAddRemoteBackendValues(values: AddRemoteBackendValues): string | null {
  if (!values.label.trim()) return 'Pick a label so the picker shows something useful.';
  if (values.mode === 'http' && !values.url.trim()) return 'URL is required for HTTP backends.';
  if (values.mode === 'ssh' && (!values.sshHost.trim() || !values.sshUser.trim())) {
    return 'SSH host and user are required.';
  }
  const parsedRemotePort = parseSshRemotePort(values.sshRemotePort);
  if (
    values.mode === 'ssh' &&
    (!Number.isFinite(parsedRemotePort) || parsedRemotePort <= 0)
  ) {
    return 'Remote port must be a positive number.';
  }
  return null;
}

export function normalizeBackendUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function buildRemoteBackendId(mode: RemoteBackendMode, seed: string): string {
  return `${mode}:${seed}`;
}

export function buildRemoteBackendEntry(
  values: AddRemoteBackendValues,
  id: string,
  tunnel: SshTunnelEndpoint = { localUrl: INACTIVE_SSH_TUNNEL_URL },
): BackendEntry {
  return {
    id,
    label: values.label.trim(),
    url: values.mode === 'http' ? normalizeBackendUrl(values.url) : tunnel.localUrl,
    bearerToken: values.token.trim(),
    kind: values.mode === 'http' ? 'http' : 'ssh-tunnel',
    ssh:
      values.mode === 'ssh'
        ? {
            host: values.sshHost.trim(),
            user: values.sshUser.trim(),
            keyPath: values.sshKey.trim(),
            ...(tunnel.localPort ? { localPort: tunnel.localPort } : {}),
          }
        : undefined,
  };
}
