import type {
  Capabilities,
  HealthSnapshot,
  MemoryStats,
  MetricsSnapshot,
  SlashCommandDef,
} from '../wire/types.js';
import { HttpError, type HttpTransport } from './transport.js';

type SystemTransport = Pick<HttpTransport, 'get' | 'request' | 'response'>;

export interface LspClientSummary {
  name: string;
  language?: string;
  status?: string;
  [k: string]: unknown;
}

export interface LspClientsResult {
  clients: LspClientSummary[];
}

export interface LspDiagnosticsResult {
  diagnostics: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export type ToolDetailResult = Record<string, unknown>;

export interface CapabilityGapsResult {
  capability_gaps: Record<string, Record<string, unknown>>;
}

export interface CommandsResult {
  commands: SlashCommandDef[];
}

export type PoliciesDocument = Record<string, unknown> | unknown[];

export interface PoliciesResult {
  policies: PoliciesDocument;
}

export interface PutPoliciesInput {
  policies: PoliciesDocument;
}

export function fetchCapabilities(client: SystemTransport): Promise<Capabilities> {
  return client.get<Capabilities>('/v1/capabilities');
}

export async function fetchHealth(client: SystemTransport): Promise<HealthSnapshot> {
  const res = await client.response('/v1/health');
  if (res.ok) return (await res.json()) as HealthSnapshot;
  if (res.status === 503) {
    try {
      const body = (await res.json()) as HealthSnapshot;
      if (typeof body?.healthy === 'boolean' || Array.isArray(body?.integrations)) {
        return body;
      }
    } catch {
      // fall through to throw with the original body
    }
  }
  throw new HttpError(res.status, res.statusText, await res.text().catch(() => ''));
}

export function fetchLspClients(client: SystemTransport): Promise<LspClientsResult> {
  return client.get('/v1/lsp/clients');
}

export function fetchLspDiagnostics(
  client: SystemTransport,
  name: string,
): Promise<LspDiagnosticsResult> {
  return client.get(`/v1/lsp/clients/${encodeURIComponent(name)}/diagnostics`);
}

export function fetchToolDetail(
  client: SystemTransport,
  toolId: string,
): Promise<ToolDetailResult> {
  return client.get(`/v1/tools/${encodeURIComponent(toolId)}`);
}

export function fetchCapabilityGaps(
  client: SystemTransport,
): Promise<CapabilityGapsResult> {
  return client.get<CapabilityGapsResult>('/v1/capability-gaps');
}

export function fetchMemoryStats(
  client: SystemTransport,
  sessionId?: string,
): Promise<MemoryStats> {
  const path = sessionId
    ? `/v1/memory/stats?session_id=${encodeURIComponent(sessionId)}`
    : '/v1/memory/stats';
  return client.get<MemoryStats>(path);
}

export function fetchMetrics(client: SystemTransport): Promise<MetricsSnapshot> {
  return client.get<MetricsSnapshot>('/v1/metrics');
}

export function fetchCommands(client: SystemTransport): Promise<CommandsResult> {
  return client.get<CommandsResult>('/v1/commands');
}

export function fetchPolicies(client: SystemTransport): Promise<PoliciesResult> {
  return client.get('/v1/policies');
}

/**
 * GET /v1/relay/status — this backend's OWN configured relay identity plus a
 * fresh bounded TCP reachability probe (clio-agent#1179). A singleton: the
 * one relay this backend tunnels agent traffic through, not a registry of
 * named relay hosts to add/remove — see the Relays settings page for how
 * that differs from the prototype's multi-host registry concept.
 */
export interface RelayStatus {
  configured: boolean;
  host?: string | null;
  reachable?: boolean | null;
  checked_at?: string | null;
  reason?: string | null;
  detail?: string | null;
  [k: string]: unknown;
}

export function updatePolicies(
  client: SystemTransport,
  body: PutPoliciesInput,
): Promise<unknown> {
  return client.request<unknown>('/v1/policies', 'PUT', body);
}

export function fetchRelayStatus(client: SystemTransport): Promise<RelayStatus> {
  return client.get<RelayStatus>('/v1/relay/status');
}
