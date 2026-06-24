/**
 * Pure helpers for the backends settings list: status chip mapping, the
 * capabilities probe URL, auth headers, and capability label extraction.
 */
import type { BackendEntry } from '@clio/core';

export interface BackendStatusChip {
  label: 'error' | 'reachable' | 'unknown';
  cls: 'chip--err' | 'chip--ok' | 'chip--warn';
}

export function backendStatusChip(entry: BackendEntry): BackendStatusChip {
  if (entry.lastError) return { label: 'error', cls: 'chip--err' };
  if (entry.capabilities) return { label: 'reachable', cls: 'chip--ok' };
  return { label: 'unknown', cls: 'chip--warn' };
}

export function capabilitiesProbeUrl(entry: Pick<BackendEntry, 'url'>): string {
  return `${entry.url.replace(/\/+$/, '')}/v1/capabilities`;
}

export function backendAuthHeaders(
  entry: Pick<BackendEntry, 'bearerToken'>,
): Record<string, string> {
  return entry.bearerToken ? { Authorization: `Bearer ${entry.bearerToken}` } : {};
}

export function backendCapabilityLabels(entry: BackendEntry): string[] {
  const caps = entry.capabilities;
  if (!caps) return [];

  const labels = [`contract ${caps.contract_version}`];
  if (caps.transports?.events_sse) labels.push('sse');
  if (caps.capabilities?.permissions) labels.push('permissions');
  if (caps.capabilities?.diffs) labels.push('diffs');
  if (caps.capabilities?.agent_routing) labels.push('agents');
  if (caps.capabilities?.mcp) labels.push('mcp');
  if (caps.capabilities?.memory) labels.push('memory');
  return labels;
}
