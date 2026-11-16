import type { StatusTone } from './primitives/status-indicator';
import { humanizeToolName } from './tool-presentation';
import { t } from '@lingui/core/macro';

/** Health check names and states in words, shared by Health and Report a problem. */
export function statusValue(status: string) {
  if (['ready', 'healthy', 'live'].includes(status)) return 'healthy';
  if (['degraded', 'warning', 'reconnecting'].includes(status)) return 'degraded';
  return 'unavailable';
}

export function statusOf(status: string): { tone: StatusTone; label: string } {
  const value = statusValue(status);
  if (value === 'healthy') return { tone: 'success', label: t`Ready` };
  if (value === 'degraded') return { tone: 'warning', label: t`Needs attention` };
  return { tone: 'error', label: t`Unavailable` };
}

const integrationTitles: Record<string, string> = {
  lm_provider: t`Language model provider`,
  arc: t`Conversation memory`,
  clio_core_ram_cap: t`Memory working limit`,
  clio_core_liveness: t`Memory service connection`,
  clio_core_daemon_memory: t`Memory service process`,
  cte_cold_tier_disk: t`Stored memory capacity`,
  file_policy: t`File access policy`,
  gateway: t`Tools`,
  api: t`Workspace service`,
  clio_core: t`Memory storage`,
  clio_core_attach: t`Memory service attachment`,
  cte_store_location: t`Stored memory location`,
  cte_metadata_log: t`Stored memory log`,
  sandbox: t`Protected execution`,
  sandbox_conformance: t`Execution protection coverage`,
  child_reaper: t`Process cleanup`,
  child_processes: t`Background processes`,
  child_parentage: t`Background process ownership`,
  compaction_prompt: t`Compaction instructions`,
  browser: t`Browser`,
  ripgrep: t`File search`,
  managed_packages: t`Managed packages`,
  store_migrations: t`Stored data upgrades`,
  arc_store_format: t`Stored data format`,
};

export function integrationTitle(name: string) {
  const title = integrationTitles[name] ?? humanizeToolName(name);
  // An unknown identifier still reads as words, never as snake_case.
  return /_/u.test(title)
    ? title.charAt(0).toUpperCase() + title.slice(1).replaceAll('_', ' ')
    : title;
}
