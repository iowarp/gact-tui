/**
 * Orchestrates saving a remote backend: opens the SSH tunnel when needed,
 * builds the registry entry, and selects it. Exports the controller factory
 * plus its registry/runtime contracts.
 */
import type { BackendEntry } from '@clio/core';
import type { BackendRegistry } from '../registry.js';
import type { TunnelHandle, TunnelRequest } from '../tauri.js';
import {
  buildRemoteBackendEntry,
  buildRemoteBackendId,
  parseSshRemotePort,
  type AddRemoteBackendValues,
  type SshTunnelEndpoint,
} from './AddRemoteBackendModel.js';

export type AddRemoteBackendRegistry = Pick<
  BackendRegistry,
  'add' | 'select' | 'refreshCapabilities'
>;

export interface AddRemoteBackendRuntime {
  isDesktop: () => boolean;
  openTunnel: (request: TunnelRequest) => Promise<TunnelHandle>;
  randomSeed?: () => string;
}

export interface SavedRemoteBackend {
  id: string;
  entry: BackendEntry;
}

export async function saveRemoteBackend(
  values: AddRemoteBackendValues,
  registry: AddRemoteBackendRegistry,
  runtime: AddRemoteBackendRuntime,
): Promise<SavedRemoteBackend> {
  const id = buildRemoteBackendId(values.mode, runtime.randomSeed?.() ?? cryptoRandomId());
  let tunnel: SshTunnelEndpoint | undefined;

  if (values.mode === 'ssh' && runtime.isDesktop()) {
    const opened = await runtime.openTunnel({
      host: values.sshHost.trim(),
      user: values.sshUser.trim(),
      remote_port: parseSshRemotePort(values.sshRemotePort),
      key_path: values.sshKey.trim(),
    });
    tunnel = { localUrl: opened.local_url, localPort: opened.local_port };
  }

  const entry = buildRemoteBackendEntry(values, id, tunnel);
  registry.add(entry);
  registry.select(id);

  if (entry.kind === 'http' || (entry.kind === 'ssh-tunnel' && runtime.isDesktop())) {
    await registry.refreshCapabilities(id);
  }

  return { id, entry };
}

export function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(8);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 12);
}
