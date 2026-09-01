import type { SubagentRun } from '@clio/core/v3';
import { PRESENTATION_OVERRIDE_REGISTRY } from '@/lib/presentation-override-registry';
import { reportPresentationOverride } from '@/lib/presentation-overrides';

export interface ChildAgentAssignment {
  detail?: string;
  label: string;
}

/** Uses only server-owned assignment and summary fields. */
export function getChildAgentAssignment(subagent: SubagentRun): ChildAgentAssignment {
  const task = subagent.task?.trim();
  if (task) return { label: task };

  const summary = subagent.summary?.trim();
  if (summary) return { label: summary };

  const label = 'Delegated work';
  reportPresentationOverride({
    kind: 'child-assignment-fallback',
    entityId: subagent.id,
    sessionId: subagent.session_id,
    serverValue: { summary: subagent.summary, task: subagent.task },
    rendered: label,
    issue: PRESENTATION_OVERRIDE_REGISTRY['child-assignment-fallback'].issue,
  });
  return { label };
}
