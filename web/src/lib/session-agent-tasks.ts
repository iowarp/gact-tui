import {
  operationalRunStateSchema,
  type AgentTaskRecord,
  type AsyncProcess,
  type RunState,
  type SubagentRun,
} from '@clio/core/v3';

/** Filter operational work while keeping unresolved executions visible for inspection. */
export function matchesRunState(state: RunState, filter: string): boolean {
  return (
    filter === 'all' ||
    state === filter ||
    (filter === 'active' && !['completed', 'failed', 'cancelled', 'interrupted'].includes(state)) ||
    (filter === 'attention' &&
      ['failed', 'interrupted', 'waiting_permission', 'waiting_user', 'task_state_uncertain'].includes(
        state,
      ))
  );
}

/**
 * Agent aliases use the same operational-state decoder as Runs and Work.
 * Unknown future or historical states remain explicitly unknown.
 */
/** Project one task snapshot into the child-agent record the UI already renders. */
export function agentTaskToSubagent(task: AgentTaskRecord): SubagentRun {
  const rawState = task.live_state || task.status;
  const title = task.run_label || `${task.expert_id || 'agent'} #${task.run_index + 1}`;
  const summary = task.error_reason || task.answer_excerpt;
  return {
    id: task.task_id,
    session_id: task.parent_session_id,
    ...(task.parent_turn_id ? { parent_run_id: task.parent_turn_id } : {}),
    ...(task.child_session_id ? { child_session_id: task.child_session_id } : {}),
    ...(task.expert_id ? { agent_id: task.expert_id } : {}),
    title,
    state: operationalRunStateSchema.parse(rawState),
    ...(summary ? { summary } : {}),
    ...(task.answer_excerpt ? { result: task.answer_excerpt } : {}),
    ...(task.model_choice ? { model_choice: task.model_choice } : {}),
  };
}

/**
 * Derive children from the same loaded Core work page as the task rows.
 * Live transcript records contribute retained output, labels and duration.
 * This projection does not perform a second registry query or own lifecycle state.
 */
export function mergeSessionSubagents(
  live: readonly SubagentRun[],
  processes: readonly AsyncProcess[] | undefined,
): SubagentRun[] {
  const tasks = processes?.filter(
    (task) => task.task_kind === 'Subagent' || (!task.task_kind && task.kind === 'agent'),
  );
  if (!tasks?.length) return [...live];
  const liveById = new Map(live.map((subagent) => [subagent.id, subagent]));
  const merged = tasks.map((task) => {
    const id = task.handle ?? task.handle_id ?? task.id;
    const fromLive = liveById.get(id);
    return {
      ...fromLive,
      id,
      session_id: task.parent_session_id ?? task.owner_session_id ?? '',
      child_session_id: task.child_session_id ?? task.owner_session_id,
      parent_run_id: task.parent_turn_id,
      title: fromLive?.title || task.title,
      state: operationalRunStateSchema.parse(task.live_state || task.status),
      task: task.description ?? fromLive?.task,
      model_choice: task.model_choice ?? fromLive?.model_choice,
      ...(task.error_reason ? { summary: task.error_reason } : {}),
    };
  });
  const known = new Set(merged.map((subagent) => subagent.id));
  return [...merged, ...live.filter((subagent) => !known.has(subagent.id))];
}
