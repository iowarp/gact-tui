import type { AsyncProcess } from '@clio/core/v3';
import { flowRunStatus } from './flow-run-presentation';

/** Keep the flow checkpoint outcome separate from execution of its conversation task. */
export function taskFlowState(task: AsyncProcess, execution: string) {
  const flow = task.flow;
  if (!flow) return undefined;
  if (flow.status === 'not_run')
    return {
      value: 'not_run',
      label: 'No new run',
      detail:
        'This invocation completed without starting another flow. The earlier attempt is separate.',
    };
  if (!flow.status || flow.status === 'unknown')
    return {
      value: execution === 'failed' ? 'failed' : 'unknown',
      label: execution === 'failed' ? 'Failed' : 'Outcome not recorded',
      detail: flow.detail || 'Task completion does not establish a completed flow.',
    };
  const state = flowRunStatus({
    status: flow.status,
    outcome: flow.outcome
      ? { reason: flow.outcome.reason ?? '', message: flow.outcome.message ?? '' }
      : null,
  });
  if (
    state.value === 'running' &&
    ['completed', 'failed', 'cancelled', 'interrupted'].includes(execution)
  )
    return {
      value: execution === 'completed' ? 'unknown' : execution,
      label: 'Flow outcome unconfirmed',
      detail: `The task ${execution}, but the checkpoint still says running.`,
    };
  if (
    state.value === 'completed' &&
    ['failed', 'cancelled', 'interrupted', 'task_state_uncertain'].includes(execution)
  )
    return {
      value: 'degraded',
      label: 'Task settlement needs inspection',
      detail: 'The flow checkpoint completed, but its owning task did not settle successfully.',
    };
  return { ...state, detail: flow.outcome?.message };
}
