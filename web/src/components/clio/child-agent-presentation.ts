import type { SubagentRun } from '@clio/core/v3';

export interface ChildAgentAssignment {
  detail?: string;
  label: string;
}

/** Uses only server-owned assignment and summary fields. */
export function getChildAgentAssignment(subagent: SubagentRun): ChildAgentAssignment {
  const task = subagent.task?.trim();
  if (task) return { label: task };

  const summary = subagent.summary?.trim();
  return { label: summary || 'Delegated work' };
}
