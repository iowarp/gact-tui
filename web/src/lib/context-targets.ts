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
  return [
    { id: sessionId, label: mainAgentLabel || 'Main agent', detail: 'Main agent' },
    ...subagents.flatMap((subagent) =>
      subagent.child_session_id
        ? [{ id: subagent.child_session_id, label: subagent.title, detail: 'Child agent' }]
        : [],
    ),
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
