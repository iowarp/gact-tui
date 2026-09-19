// Shared presentation helpers for the Infrastructure > Agent foundation rows
// (`FoundationRow` and `SandboxFoundationRow`, in infrastructure-page.tsx and
// infrastructure-sandbox-row.tsx respectively). Split out to a leaf module —
// no React, no query state — so both row components can import it without
// creating a cycle between the two component files.
import type { ServiceIntegrationHealth } from '@clio/core/v3';
import type { ClioStatusValue } from '@/components/clio/status';
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

export function foundationSummary(integration: ServiceIntegrationHealth): string {
  const ready: Record<string, string> = {
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
  const degraded: Record<string, string> = {
    arc: 'Conversation memory is using a limited local fallback.',
    sandbox: `Extra operating-system confinement is not enabled. ${vocab.agent} still applies ${vocab.workspace} access rules and records out-of-${vocab.workspace} attempts.`,
    child_parentage: 'Some background processes are no longer attached to this agent service.',
  };
  if (integrationStatus(integration.status) === 'healthy') {
    return ready[integration.name] ?? 'This supporting service is ready.';
  }
  return degraded[integration.name] ?? 'This supporting service needs attention.';
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
    clio_core_ram_cap: 'Memory working limit',
    clio_core_liveness: 'Memory service connection',
    clio_core_daemon_memory: 'Memory service process',
    cte_cold_tier_disk: 'Stored memory capacity',
    sandbox_conformance: 'Execution protection coverage',
    child_reaper: 'Process cleanup',
    child_processes: 'Background processes',
    child_parentage: 'Background process ownership',
  };
  return names[name] || name.replaceAll('_', ' ').replace(/^./u, (value) => value.toUpperCase());
}
