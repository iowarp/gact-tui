import type { Session, SubagentRun } from '@clio/core/v3';

export interface ClioContextTarget {
  id: string;
  label: string;
  detail: string;
}

export function buildContextTargets(
  sessionId: string,
  mainAgentLabel: string | undefined,
  subagents: readonly SubagentRun[],
): ClioContextTarget[] {
  const childTargets = subagents.flatMap((subagent) =>
    subagent.child_session_id
      ? [{ id: subagent.child_session_id, label: subagent.title, detail: 'Child agent' }]
      : [],
  );
  const totals = new Map<string, number>();
  for (const target of childTargets) {
    totals.set(target.label, (totals.get(target.label) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return [
    { id: sessionId, label: mainAgentLabel || 'Main agent', detail: 'Main agent' },
    ...childTargets.map((target) => {
      const occurrence = (seen.get(target.label) ?? 0) + 1;
      seen.set(target.label, occurrence);
      return (totals.get(target.label) ?? 0) > 1
        ? { ...target, label: `${target.label}, turn ${occurrence}` }
        : target;
    }),
  ];
}

export function resolveContextSession(
  targetId: string,
  session: Session | undefined,
  sessions: readonly Session[],
): Session | undefined {
  if (targetId === session?.id) return session;
  return sessions.find(
    (candidate) => candidate.id === targetId && candidate.parent_session_id === session?.id,
  );
}
