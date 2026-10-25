import type { AsyncProcess, SubagentRun } from '@clio/core/v3';

export interface TaskActivity {
  key: string;
  process?: AsyncProcess;
  subagent?: SubagentRun;
}

/** Settlement is independent of whether a row represents a tool or a child agent. */
export function isSettledTaskActivity(entry: TaskActivity): boolean {
  const state = entry.process
    ? (entry.process.effective_status ?? entry.process.live_state)
    : entry.subagent!.state;
  return ['completed', 'failed', 'cancelled', 'interrupted'].includes(state);
}

/** Join projections by recorded identity, never by title or assignment text. */
export function taskActivity(
  processes: readonly AsyncProcess[],
  subagents: readonly SubagentRun[] = [],
): TaskActivity[] {
  const represented = new Set<SubagentRun>();
  const entries: TaskActivity[] = processes.map((process) => {
    const childTask =
      process.task_kind === 'Subagent' || (!process.task_kind && process.kind === 'agent');
    const exact = childTask
      ? subagents.filter(
          (child) =>
            child.id === process.id &&
            (!process.child_session_id || child.child_session_id === process.child_session_id),
        )
      : [];
    const sameSession = processes.filter(
      (other) => other.child_session_id === process.child_session_id,
    );
    const candidates = exact.length
      ? exact
      : childTask && process.child_session_id && sameSession.length === 1
        ? subagents.filter((child) => child.child_session_id === process.child_session_id)
        : [];
    const subagent = candidates.length === 1 ? candidates[0] : undefined;
    if (subagent) represented.add(subagent);
    return { key: process.handle ?? process.handle_id ?? process.id, process, subagent };
  });
  return [
    ...entries,
    ...subagents
      .filter((child) => !represented.has(child))
      .map((subagent) => ({ key: `child:${subagent.id}`, subagent })),
  ];
}
