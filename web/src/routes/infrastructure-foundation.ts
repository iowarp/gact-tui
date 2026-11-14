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
import { t } from '@lingui/core/macro';

export function integrationStatus(status: string): ClioStatusValue {
  if (['ready', 'healthy', 'live', 'skipped'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'reconnecting'].includes(status)) return 'degraded';
  return 'unavailable';
}

export function integrationStatusLabel(status: ClioStatusValue): string {
  if (status === 'healthy') return t`Ready`;
  if (status === 'degraded') return t`Needs attention`;
  return t`Unavailable`;
}

/** The status mark for a foundation row; its words come from integrationStatusLabel. */
export function integrationTone(status: ClioStatusValue): StatusTone {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'connecting') return 'running';
  return 'error';
}

const READY_MEANING: Record<string, string> = {
  api: t`The workspace service is available.`,
  arc: t`Conversation memory is available.`,
  gateway: t`Connected tools are available to agents.`,
  file_policy: t`Workspace file access rules are active.`,
  lm_provider: t`The selected language model is ready.`,
  sandbox: t`Protected command and file execution is active.`,
  clio_core: t`The full conversation-memory service is available.`,
  sandbox_conformance: t`Agent processes are using the configured execution protection.`,
  child_reaper: t`Background processes will be cleaned up with the agent service.`,
  child_processes: t`No unexpected background work is running.`,
  child_parentage: t`Background work remains attached to this agent service.`,
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
  const { agent, workspace } = vocab;
  const degraded: Record<string, string> = {
    arc: t`Conversation memory is using a limited local fallback.`,
    sandbox: t`Extra operating-system confinement is not enabled. ${agent} still applies ${workspace} access rules and records out-of-${workspace} attempts.`,
    child_parentage: t`Some background processes are no longer attached to this agent service.`,
    store_migrations: t`Data upgrades ran at startup because installation skipped them.`,
  };
  if (integrationStatus(integration.status) === 'healthy') return undefined;
  if (integration.name === 'lm_provider') {
    return integration.summary || t`Check the selected provider connection to confirm it is ready.`;
  }
  return (
    degraded[integration.name] ??
    (plainSentence(integration.summary) || t`This supporting service needs attention.`)
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
    api: t`Workspace service`,
    arc: t`Conversation memory`,
    gateway: t`Tool gateway`,
    file_policy: t`Workspace file access`,
    lm_provider: t`Language model provider`,
    sandbox: t`Protected execution`,
    clio_core: t`Memory storage`,
    clio_core_attach: t`Memory service attachment`,
    clio_core_ram_cap: t`Memory working limit`,
    clio_core_liveness: t`Memory service connection`,
    clio_core_daemon_memory: t`Memory service process`,
    cte_cold_tier_disk: t`Stored memory capacity`,
    cte_store_location: t`Memory store location`,
    cte_metadata_log: t`Memory metadata log`,
    arc_store_format: t`Conversation data format`,
    store_migrations: t`Data upgrades`,
    compaction_prompt: t`Conversation summary prompt`,
    browser: t`Web browser`,
    ripgrep: t`File search`,
    managed_packages: t`Tool packages`,
    sandbox_conformance: t`Execution protection coverage`,
    child_reaper: t`Process cleanup`,
    child_processes: t`Background processes`,
    child_parentage: t`Background process ownership`,
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
