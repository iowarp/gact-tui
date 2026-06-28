/**
 * View-model / pure logic for Agents Page: state shaping and helpers, no DOM. Key export `filterAgents`.
 */
import type { AgentDef } from '@clio/core';

export function filterAgents(agents: AgentDef[], query: string): AgentDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return agents;
  return agents.filter(
    (agent) =>
      agent.title.toLowerCase().includes(q) ||
      agent.id.toLowerCase().includes(q) ||
      (agent.description ?? '').toLowerCase().includes(q) ||
      (agent.keywords ?? []).some((keyword) => keyword.toLowerCase().includes(q)),
  );
}

export function sortAgentsByTier(agents: AgentDef[]): AgentDef[] {
  return [...agents].sort((a, b) => (a.tier ?? 99) - (b.tier ?? 99));
}
