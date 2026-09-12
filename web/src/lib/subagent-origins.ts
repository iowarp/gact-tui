import type { Session, SubagentRun } from '@clio/core/v3';

const SKILL_HEADING = /^#\s+Skill:\s*(.+?)\s*$/imu;

/** Preserve the server-recorded skill and execution mode on child-agent projections. */
export function withSubagentOrigins(
  subagents: readonly SubagentRun[],
  sessions: readonly Session[],
): SubagentRun[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  return subagents.map((subagent) => {
    const childSession = subagent.child_session_id
      ? sessionsById.get(subagent.child_session_id)
      : undefined;
    const pendingSpawn = asRecord(childSession?.metadata?.pending_spawn);
    const seedContext =
      typeof pendingSpawn?.seed_context === 'string' ? pendingSpawn.seed_context : '';
    const skillName = SKILL_HEADING.exec(seedContext)?.[1]?.trim();
    if (!skillName) return subagent;
    const recordedMode = pendingSpawn?.mode;
    const mode = recordedMode === 'sync' || recordedMode === 'async' ? recordedMode : undefined;
    return {
      ...subagent,
      origin: { kind: 'skill', name: skillName, mode },
    };
  });
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
