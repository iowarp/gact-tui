import { ClioRepository } from '@clio/core/v3';
import { BrowserClioTransport } from './transport/browser-transport';
import { inTauri } from './transport/tauri-runtime';
import { TauriClioTransport } from './transport/tauri-transport';

export interface ConnectionSettings {
  endpoint: string;
  token?: string;
  label?: string;
  location?: string;
  infrastructure?: InfrastructureConnection;
}

export interface SavedConnection {
  endpoint: string;
  label?: string;
  location?: string;
  infrastructure?: InfrastructureConnection;
}

/** Durable ownership reference for a CLIO service reached through local CLIO infrastructure. */
export interface InfrastructureConnection {
  targetId: string;
  serviceId: 'clio_agent';
  /**
   * The SSH route `targetId` was created from, saved so a desktop that
   * never created -- or no longer has -- that target's record (a fresh
   * install after an update, a second computer, a different local CLIO)
   * can rebuild it instead of failing outright. Absent for the built-in
   * local target and for connections saved before this field existed.
   */
  route?: SavedSshRoute;
}

/** Enough of an SSH host's route to recreate its infrastructure target. */
export interface SavedSshRoute {
  remotePort?: number;
  keepRunning?: boolean;
  label: string;
  installRoot: string;
  profile: string;
  host: string;
  user: string;
  port: number;
  jumpHosts: string[];
  identityFile: string;
  platform: 'auto' | 'linux' | 'windows';
}

/**
 * A saved connection's infrastructure target is missing on this computer's
 * local CLIO, and there was no saved route to rebuild it from (or rebuilding
 * it failed). Distinct from a plain `Error` so the UI can offer a concrete
 * recovery action instead of just showing the message.
 */
export class InfrastructureTargetGoneError extends Error {
  constructor(public readonly label: string) {
    super(`${label} is not known on this computer. Remove it and deploy it again to reconnect.`);
    this.name = 'InfrastructureTargetGoneError';
  }
}

export const DEFAULT_ENDPOINT = 'http://127.0.0.1:8787';

export function normalizeEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Connection addresses must use http or https');
  }
  if (url.username || url.password) {
    throw new Error('Put access tokens in Advanced settings, not in the connection address');
  }
  return url.toString().replace(/\/$/, '');
}

export function createRepository(settings: ConnectionSettings): ClioRepository {
  const transport = inTauri()
    ? new TauriClioTransport(settings)
    : new BrowserClioTransport(settings);
  return new ClioRepository(transport);
}
