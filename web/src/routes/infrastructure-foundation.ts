// Shared presentation helpers for the Infrastructure > Agent foundation rows
// (`FoundationRow` and `SandboxFoundationRow`, in
// components/clio/infrastructure-foundation-row.tsx and
// infrastructure-sandbox-row.tsx respectively). Split out to a leaf module —
// no React, no query state — so both row components can import it without
// creating a cycle between the two component files.
import type { ServiceIntegrationHealth } from '@clio/core/v3';
import type { ClioStatusValue } from '@/components/clio/status';
import type { StatusTone } from '@/components/clio/primitives/status-indicator';
import { vocab } from '@/lib/brand-vocabulary';

export function integrationStatus(status: string): ClioStatusValue {
  if (['ready', 'healthy', 'live', 'skipped'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'reconnecting'].includes(status)) return 'degraded';
  return 'unavailable';
}

export function integrationStatusLabel(status: ClioStatusValue): string {
  if (status === 'healthy') return 'Ready';
  if (status === 'degraded') return 'Needs attention';
  return 'Unavailable';
}

/** The status mark for a foundation row; its words come from integrationStatusLabel. */
export function integrationTone(status: ClioStatusValue): StatusTone {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'connecting') return 'running';
  return 'error';
}

const READY_MEANING: Record<string, string> = {
  api: 'The workspace service is available.',
  arc: 'Conversation memory is available.',
  gateway: 'Connected tools are available to agents.',
  file_policy: 'Workspace file access rules are active.',
  lm_provider: 'The selected language model is ready.',
  sandbox: 'Protected command and file execution is active.',
  clio_core: 'The full conversation-memory service is available.',
  sandbox_conformance: 'Agent processes are using the configured execution protection.',
  child_reaper: 'Background processes will be cleaned up with the agent service.',
  child_processes: 'No unexpected background work is running.',
  child_parentage: 'Background work remains attached to this agent service.',
};

/** What a ready row means, for its opened details; the row itself reads only "Ready". */
export function foundationMeaning(integration: ServiceIntegrationHealth): string | undefined {
  return READY_MEANING[integration.name];
}

/**
 * The row's sentence under its name. Ready rows have none (spec: name and
 * "Ready"); only rows that need attention or are unavailable explain why.
 */
export function foundationSummary(integration: ServiceIntegrationHealth): string | undefined {
  const degraded: Record<string, string> = {
    arc: 'Conversation memory is using a limited local fallback.',
    sandbox: `Extra operating-system confinement is not enabled. ${vocab.agent} still applies ${vocab.workspace} access rules and records out-of-${vocab.workspace} attempts.`,
    child_parentage: 'Some background processes are no longer attached to this agent service.',
    store_migrations: 'Data upgrades ran at startup because installation skipped them.',
  };
  if (integrationStatus(integration.status) === 'healthy') return undefined;
  if (integration.name === 'lm_provider') {
    return integration.summary || 'Check the selected provider connection to confirm it is ready.';
  }
  return (
    degraded[integration.name] ??
    (plainSentence(integration.summary) || 'This supporting service needs attention.')
  );
}

/**
 * A server summary as one plain sentence for the row: code quotes become words and
 * the first clause stands alone. The full text stays in the row's technical details.
 */
function plainSentence(text: string | undefined): string {
  const plain = (text ?? '')
    .replace(/``(.+?)``/gu, '$1')
    .replace(/`([^`]+)`/gu, '$1')
    .replace(/\s+/gu, ' ')
    .trim();
  const first = plain.split(/;\s|(?<=[.!?])\s/u)[0]?.trim() ?? '';
  return first && !/[.!?]$/u.test(first) ? `${first}.` : first;
}

/** Group every displayed row once, using the same status mapping as its badge. */
export function foundationGroups(integrations: ServiceIntegrationHealth[]) {
  return {
    errors: integrations.filter((row) => integrationStatus(row.status) === 'unavailable'),
    warnings: integrations.filter((row) => integrationStatus(row.status) === 'degraded'),
    ready: integrations.filter((row) => integrationStatus(row.status) === 'healthy'),
  };
}

export function foundationTitle(name: string): string {
  const names: Record<string, string> = {
    api: 'Workspace service',
    arc: 'Conversation memory',
    gateway: 'Tool gateway',
    file_policy: 'Workspace file access',
    lm_provider: 'Language model provider',
    sandbox: 'Protected execution',
    clio_core: 'Memory storage',
    clio_core_attach: 'Memory service attachment',
    clio_core_ram_cap: 'Memory working limit',
    clio_core_liveness: 'Memory service connection',
    clio_core_daemon_memory: 'Memory service process',
    cte_cold_tier_disk: 'Stored memory capacity',
    cte_store_location: 'Memory store location',
    cte_metadata_log: 'Memory metadata log',
    arc_store_format: 'Conversation data format',
    store_migrations: 'Data upgrades',
    compaction_prompt: 'Conversation summary prompt',
    browser: 'Web browser',
    ripgrep: 'File search',
    managed_packages: 'Tool packages',
    sandbox_conformance: 'Execution protection coverage',
    child_reaper: 'Process cleanup',
    child_processes: 'Background processes',
    child_parentage: 'Background process ownership',
  };
  if (names[name]) return names[name];
  // An unknown row still reads as words: internal component names become what they are.
  const words = name
    .replaceAll('_', ' ')
    .replace(/\bclio core\b/giu, 'memory service')
    .replace(/\bcte\b/giu, 'memory store')
    .replace(/\barc\b/giu, 'conversation memory');
  return words.replace(/^./u, (value) => value.toUpperCase());
}
