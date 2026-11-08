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

/** Where a CLIO agent serves its API and web UI by default. */
export const DEFAULT_ENDPOINT = 'http://127.0.0.1:17800';

/** Vite's own dev-server port: a page there is never served by the agent. */
const VITE_DEV_PORT = '5173';

export interface PageHost {
  desktop: boolean;
  /** A Vite dev server is serving this page. */
  dev: boolean;
  location?: Pick<Location, 'origin' | 'port' | 'protocol'>;
}

/**
 * The agent's address when the agent itself served this page: the page's own origin.
 * Undefined in the desktop app, under a Vite dev server, or for a non-http page.
 */
export function servedEndpointFor({ desktop, dev, location }: PageHost): string | undefined {
  if (desktop || dev || !location) return undefined;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return undefined;
  if (location.port === VITE_DEV_PORT) return undefined;
  return location.origin;
}

/** This page's origin when an agent served it (#739 B7). */
export function servedEndpoint(): string | undefined {
  return servedEndpointFor({
    desktop: inTauri(),
    dev: import.meta.env.DEV,
    location: typeof window === 'undefined' ? undefined : window.location,
  });
}

/** The address a new connection starts from: the serving agent, else the agent default. */
export function defaultEndpoint(): string {
  return servedEndpoint() ?? DEFAULT_ENDPOINT;
}

/** Explicit remote routes take precedence over a direct loopback connection. */
export function connectionIsLocal(settings: ConnectionSettings, managed = false): boolean {
  if (settings.infrastructure) {
    return !settings.infrastructure.route && settings.infrastructure.targetId === 'local';
  }
  if (managed) return true;
  const location = settings.location?.trim().toLowerCase();
  if (location) return ['local', 'this computer', 'this device'].includes(location);
  try {
    const url = new URL(settings.endpoint);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

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
