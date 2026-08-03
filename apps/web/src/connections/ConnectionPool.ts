import { Client } from '@clio/core';
import type { Capabilities } from '@clio/core';
import { SUPPORTED_CONTRACTS, createClient, normalizeBackendUrl } from '../backend/connection';

export type ConnectionStatus = 'ready' | 'refused' | 'error';

export type ConnectionFailure = 'unsupported_contract' | 'unreachable' | 'invalid_url';

export interface ConnectionSpec {
  id: string;
  label: string;
  url: string;
  bearerToken?: string;
}

export interface Connection {
  id: string;
  label: string;
  url: string;
  status: ConnectionStatus;
  /** This connection's OWN client. Never shared. */
  client?: Client;
  capabilities?: Capabilities;
  reason?: ConnectionFailure;
  detail?: string;
}

export interface ConnectResult {
  status: ConnectionStatus;
  reason?: ConnectionFailure;
  detail?: string;
}

/** Resolves capabilities for a URL. Injected so tests can answer per-URL. */
export type ConnectionProbe = (url: string, bearerToken?: string) => Promise<Capabilities>;

export interface UnionRow<T> {
  connectionId: string;
  connectionLabel: string;
  item: T;
}

/**
 * The multi-connection pool (D1: multi-connection client, NO hub).
 *
 * Every connection owns its client, its capabilities and its failure state.
 * Nothing here is process-global — that is deliberate, and it is what the leak
 * audit in the tests protects: in the legacy app theme, toasts and persistence
 * were app-global, so a second backend could quietly clobber the first.
 *
 * A connection that refuses or errors is KEPT with its reason attached. A user
 * who added a backend needs to see why it will not serve them; silently
 * dropping it looks identical to losing the entry.
 */
export class ConnectionPool {
  private readonly connections = new Map<string, Connection>();

  constructor(private readonly probe: ConnectionProbe = defaultProbe) {}

  list(): Connection[] {
    return [...this.connections.values()];
  }

  get(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  /** Ready connections only — the ones that can actually serve a request. */
  ready(): Connection[] {
    return this.list().filter((c) => c.status === 'ready');
  }

  async connect(spec: ConnectionSpec): Promise<ConnectResult> {
    const url = normalizeBackendUrl(spec.url);
    if (!url) {
      return this.record(spec, spec.url, {
        status: 'error',
        reason: 'invalid_url',
        detail: `"${spec.url}" is not a usable backend URL.`,
      });
    }

    let capabilities: Capabilities;
    try {
      capabilities = await this.probe(url, spec.bearerToken);
    } catch (err) {
      return this.record(spec, url, {
        status: 'error',
        reason: 'unreachable',
        detail: `${url} is unreachable: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    const contract = capabilities.contract_version;
    if (!(SUPPORTED_CONTRACTS as readonly string[]).includes(contract)) {
      return this.record(
        spec,
        url,
        {
          status: 'refused',
          reason: 'unsupported_contract',
          detail:
            `${url} speaks contract ${contract || '(none advertised)'}; this build supports ` +
            `${SUPPORTED_CONTRACTS.join(', ')}. Refusing to render it.`,
        },
        capabilities,
      );
    }

    this.connections.set(spec.id, {
      id: spec.id,
      label: spec.label,
      url,
      status: 'ready',
      // Constructed per connection: sharing one client across backends is
      // exactly how cross-connection bleed starts.
      client: createClient(url, spec.bearerToken),
      capabilities,
    });
    return { status: 'ready' };
  }

  disconnect(id: string): void {
    this.connections.delete(id);
  }

  /**
   * Assemble a union view across READY connections, tagging every row with its
   * origin. Two backends can serve the same session id, so an untagged row
   * would leave the user unable to tell which backend they are acting on.
   */
  unionBy<T>(select: (connection: Connection) => T[]): Array<UnionRow<T>> {
    const rows: Array<UnionRow<T>> = [];
    for (const connection of this.ready()) {
      for (const item of select(connection)) {
        rows.push({ connectionId: connection.id, connectionLabel: connection.label, item });
      }
    }
    return rows;
  }

  private record(
    spec: ConnectionSpec,
    url: string,
    result: ConnectResult,
    capabilities?: Capabilities,
  ): ConnectResult {
    this.connections.set(spec.id, {
      id: spec.id,
      label: spec.label,
      url,
      status: result.status,
      ...(result.reason ? { reason: result.reason } : {}),
      ...(result.detail ? { detail: result.detail } : {}),
      ...(capabilities ? { capabilities } : {}),
    });
    return result;
  }
}

async function defaultProbe(url: string, bearerToken?: string): Promise<Capabilities> {
  return createClient(url, bearerToken).capabilities();
}
