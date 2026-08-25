import type { SubagentRun, ToolInvocation } from '@clio/core/v3';

/** Resolve child-agent records created by a spawn tool without relying on display order. */
export function subagentsForTool(
  tool: ToolInvocation | undefined,
  subagents: Record<string, SubagentRun>,
): SubagentRun[] {
  if (!tool || !isAgentSpawnTool(tool.name)) return [];
  const ids = taskIds(tool.output);
  if (ids.size === 0) return [];
  return Object.values(subagents).filter(
    (subagent) =>
      ids.has(subagent.id) ||
      Boolean(subagent.child_session_id && ids.has(subagent.child_session_id)),
  );
}

function isAgentSpawnTool(name: string): boolean {
  return ['spawn_agent_task', 'spawn_agents_parallel'].includes(name);
}

function taskIds(value: unknown): Set<string> {
  const ids = new Set<string>();
  const visit = (candidate: unknown) => {
    if (typeof candidate === 'string') {
      if (/^(?:task|sess)_[a-z0-9]+$/iu.test(candidate)) ids.add(candidate);
      if (/^[{[]/u.test(candidate.trim())) {
        try {
          visit(JSON.parse(candidate));
        } catch {
          // Ordinary tool output text is not expected to be JSON.
        }
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!candidate || typeof candidate !== 'object') return;
    for (const [key, item] of Object.entries(candidate)) {
      if (['task_id', 'handle_id', 'child_session_id'].includes(key) && typeof item === 'string') {
        ids.add(item);
      } else {
        visit(item);
      }
    }
  };
  visit(value);
  return ids;
}
