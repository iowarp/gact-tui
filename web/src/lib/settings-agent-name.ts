import type { AgentEntry } from '@clio/core/v3';
import { vocab } from '@/lib/brand-vocabulary';
import { isLoopbackAddress } from '@/lib/local-servers';
import { t } from '@lingui/core/macro';

/**
 * The agent an Agent-scope Settings page applies to: the connection's own
 * label, or the service's default agent and where it runs ("CLIO local",
 * "CLIO on gpu-01"). Falls back to the brand's agent noun.
 */
export function agentScopeName({
  label,
  endpoint,
  defaultAgentRef,
  agents,
}: {
  label?: string;
  endpoint: string;
  defaultAgentRef?: string;
  agents?: readonly AgentEntry[];
}): string {
  if (label) return label;
  const agent = defaultAgentRef ? agents?.find((row) => row.ref === defaultAgentRef) : undefined;
  const name = agent?.name || vocab.agent;
  if (isLoopbackAddress(endpoint)) return t`${name} local`;
  try {
    return `${name} on ${new URL(endpoint).hostname}`;
  } catch {
    return name;
  }
}

/**
 * The Settings navigation's heading for Agent-scope pages (FP-D4). A connection's own
 * label ("cloud", "lab") names a place, not what the pages configure, so it reads
 * "Agent: cloud"; a name that already says which agent it is stays as it is.
 */
export function agentScopeHeading(name: string, connectionLabel?: string): string {
  const noun = vocab.agent.charAt(0).toUpperCase() + vocab.agent.slice(1);
  if (!connectionLabel || name !== connectionLabel) return name;
  return name.toLowerCase().includes(vocab.agent.toLowerCase()) ? name : `${noun}: ${name}`;
}
