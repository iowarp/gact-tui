/**
 * Tauri SSH-tunnel bridge: opens/closes SSH tunnels to remote backends via
 * the Rust side. Exports `TunnelRequest`, `TunnelHandle`, `openSshTunnel`.
 */
import { invoke } from './tauriApi.js';
import { inTauri } from './tauri_runtime.js';

export interface TunnelRequest {
  host: string;
  user: string;
  remote_port: number;
  key_path: string;
  passphrase?: string;
}

export interface TunnelHandle {
  local_url: string;
  local_port: number;
}

/**
 * Spawn `ssh -L <local_port>:127.0.0.1:<remote_port> user@host` via the
 * Tauri shell. Returns the local URL the frontend should point its Client at.
 */
export async function openSshTunnel(req: TunnelRequest): Promise<TunnelHandle> {
  if (!inTauri()) {
    throw new Error('openSshTunnel() called outside Tauri shell');
  }
  return invoke<TunnelHandle>('tunnel_open', { request: req });
}
