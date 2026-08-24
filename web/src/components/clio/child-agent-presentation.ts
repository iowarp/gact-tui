import type { SubagentRun } from '@clio/core/v3';

export interface ChildAgentAssignment {
  detail?: string;
  label: string;
}

/** Translates persisted child-routing syntax without discarding its exact recorded value. */
export function getChildAgentAssignment(subagent: SubagentRun): ChildAgentAssignment {
  const task = subagent.task?.trim();
  if (task) return { label: task };

  const summary = subagent.summary?.trim();
  if (!summary) return { label: 'Working on a delegated part of this task.' };

  const relationship = childAgentRelationshipLabel(summary);
  return relationship
    ? { detail: `Recorded relationship: ${summary}`, label: relationship }
    : { label: summary };
}

export function childAgentRelationshipLabel(value: string | undefined): string | undefined {
  const match = value?.trim().match(/^(.+?)\s*<-\s*(.+)$/u);
  if (!match) return undefined;
  const parent = humanizeScope(match[1]!);
  return `Delegated from ${parent}`;
}

function humanizeScope(value: string): string {
  const normalized = value.trim().replaceAll('_', ' ');
  if (normalized.toLowerCase() === 'main') return 'main session';
  return normalized.replace(/^./u, (character) => character.toUpperCase());
}
