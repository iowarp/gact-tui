/**
 * Backend connection — handshake + typed outcomes.
 *
 * Owns exactly one job: turn a URL into either a live, contract-checked
 * `Client` or a TYPED refusal. Every failure path carries a reason that
 * reaches the surface; there is no branch that returns a half-connected
 * client or silently downgrades.
 *
 * Multi-connection (N first-class connection objects, per-connection
 * capability gating, keychain-held bearer tokens) is gact-tui#338 — this
 * module deliberately models ONE connection and is the seam that grows.
 */
import { Client } from '@clio/core';
import type { Capabilities, Session } from '@clio/core';
import { inTauri, tauriFetch } from '../tauri/tauri';

/** Contract versions this build knows how to render. */
export const SUPPORTED_CONTRACTS = ['0.2'] as const;

export type ConnectFailureReason =
  | 'unreachable'
  | 'unsupported_contract'
  | 'invalid_url'
  | 'handshake_failed';

export interface ConnectedBackend {
  kind: 'connected';
  url: string;
  client: Client;
  capabilities: Capabilities;
  sessions: Session[];
}

export interface ConnectFailure {
  kind: 'failed';
  url: string;
  reason: ConnectFailureReason;
  /** Human-readable detail, always shown — never swallowed. */
  detail: string;
}

export type ConnectResult = ConnectedBackend | ConnectFailure;

/**
 * Normalize user input into a base URL.
 *
 * Accepts `host:port` and bare hosts by defaulting the scheme, because that is
 * what people type. Returns null when the result still isn't a usable URL.
 */
export function normalizeBackendUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (!url.hostname) return null;
    return url.origin + url.pathname.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

/** Build a client for `url`, using the Tauri HTTP bridge when in the shell. */
export function createClient(url: string, bearerToken?: string): Client {
  return new Client({
    baseUrl: url,
    // In the desktop shell requests go through the Rust bridge so they are not
    // subject to webview CORS; in a browser this is the platform fetch.
    ...(inTauri() ? { fetch: tauriFetch as typeof fetch } : {}),
    ...(bearerToken ? { bearerToken } : {}),
  });
}

/**
 * Perform the handshake: capabilities first (which also proves reachability
 * and contract compatibility), then the session list for the landing view.
 */
export async function connectBackend(rawUrl: string, bearerToken?: string): Promise<ConnectResult> {
  const url = normalizeBackendUrl(rawUrl);
  if (!url) {
    return {
      kind: 'failed',
      url: rawUrl,
      reason: 'invalid_url',
      detail: `"${rawUrl}" is not a usable backend URL.`,
    };
  }

  const client = createClient(url, bearerToken);

  let capabilities: Capabilities;
  try {
    capabilities = await client.capabilities();
  } catch (err) {
    return {
      kind: 'failed',
      url,
      reason: 'unreachable',
      detail: describeError(err, `${url} did not answer the capabilities handshake`),
    };
  }

  const contract = capabilities.contract_version;
  if (!isSupportedContract(contract)) {
    return {
      kind: 'failed',
      url,
      reason: 'unsupported_contract',
      detail:
        `${url} speaks contract ${contract || '(none advertised)'}; ` +
        `this build supports ${SUPPORTED_CONTRACTS.join(', ')}. Refusing to render it.`,
    };
  }

  let sessions: Session[];
  try {
    // The rail groups BY workspace, so it needs every workspace's sessions.
    // Without this the backend defaults to ws_default and the rail silently
    // shows one bucket — or nothing, if the user works elsewhere.
    sessions = (await client.sessions({ include_all_workspaces: true })).sessions;
  } catch (err) {
    return {
      kind: 'failed',
      url,
      reason: 'handshake_failed',
      detail: describeError(err, `${url} accepted the handshake but its session list failed`),
    };
  }

  return { kind: 'connected', url, client, capabilities, sessions };
}

function isSupportedContract(contract: string): boolean {
  return (SUPPORTED_CONTRACTS as readonly string[]).includes(contract);
}

function describeError(err: unknown, context: string): string {
  const status =
    typeof err === 'object' && err !== null && 'status' in err
      ? (err as { status?: unknown }).status
      : undefined;
  const message = err instanceof Error ? err.message : String(err);
  return typeof status === 'number' ? `${context} (HTTP ${status}): ${message}` : `${context}: ${message}`;
}
