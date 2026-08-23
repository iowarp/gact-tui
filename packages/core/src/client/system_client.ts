import type { Capabilities, HealthSnapshot, MemoryStats, MetricsSnapshot } from '../wire/types.js';
import type {
  CapabilityGapsResult,
  CommandsResult,
  LspClientsResult,
  LspDiagnosticsResult,
  RelayStatus,
  ToolDetailResult,
} from './system.js';
import {
  fetchCapabilities,
  fetchCapabilityGaps,
  fetchCommands,
  fetchHealth,
  fetchLspClients,
  fetchLspDiagnostics,
  fetchMemoryStats,
  fetchMetrics,
  fetchRelayStatus,
  fetchToolDetail,
} from './system.js';
import { DocumentClient } from './document_client.js';

export class SystemClient extends DocumentClient {
  capabilities(): Promise<Capabilities> {
    return fetchCapabilities(this);
  }

  async health(): Promise<HealthSnapshot> {
    return fetchHealth(this);
  }

  /**
   * GET /v1/capability-gaps — backend's self-declared "intentionally
   * unsupported" or "future" capabilities. Per clio-agent develop
   * (#353 capability-gap-metadata). Keys are capability names; values
   * carry status/advertised/category/description metadata.
   */
  capabilityGaps(): Promise<CapabilityGapsResult> {
    return fetchCapabilityGaps(this);
  }

  /**
   * GET /v1/memory/stats — ARC cache + (when `sessionId` is supplied) the
   * per-session context-budget block (SPEC §6.19: tokens_retained,
   * tokens_budget, token_pressure, threshold_state).
   */
  memoryStats(sessionId?: string): Promise<MemoryStats> {
    return fetchMemoryStats(this, sessionId);
  }

  metrics(): Promise<MetricsSnapshot> {
    return fetchMetrics(this);
  }

  commands(): Promise<CommandsResult> {
    return fetchCommands(this);
  }

  /** GET /v1/lsp/clients — list configured LSP clients (per-language
   * server status). Useful for the Doctor health view. */
  lspClients(): Promise<LspClientsResult> {
    return fetchLspClients(this);
  }

  /** GET /v1/lsp/clients/{name}/diagnostics — current diagnostics
   * surfaced by an LSP client. Shape is opaque (backend-dependent). */
  lspDiagnostics(name: string): Promise<LspDiagnosticsResult> {
    return fetchLspDiagnostics(this, name);
  }

  /** GET /v1/tools/{id} — single-tool detail (richer than the bulk list). */
  getTool(toolId: string): Promise<ToolDetailResult> {
    return fetchToolDetail(this, toolId);
  }

  /**
   * GET /v1/relay/status — this backend's own configured relay + a fresh
   * reachability probe (clio-agent#1179, closed). Feeds the Settings Relays
   * page and (separately) the rail footer's relay indicator.
   */
  relayStatus(): Promise<RelayStatus> {
    return fetchRelayStatus(this);
  }
}
