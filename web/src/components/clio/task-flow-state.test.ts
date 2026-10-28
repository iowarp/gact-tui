import type { AsyncProcess } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { taskFlowState } from './task-flow-state';
const task: AsyncProcess = {
  id: 't',
  kind: 'agent',
  task_kind: 'Subagent',
  title: 'Research',
  status: 'completed',
  live_state: 'completed',
  flow: { id: 'deep-research' },
  metadata: {},
};
it('does not turn task completion into flow success without a recorded checkpoint', () => {
  expect(taskFlowState(task, 'completed')).toMatchObject({
    value: 'unknown',
    label: 'Outcome not recorded',
  });
  expect(
    taskFlowState({ ...task, flow: { id: 'deep-research', status: 'flow_stall' } }, 'completed'),
  ).toMatchObject({ value: 'failed', label: 'Stalled' });
  expect(
    taskFlowState(
      { ...task, flow: { id: 'deep-research', status: 'not_run', previous_handle: 'old' } },
      'completed',
    ),
  ).toMatchObject({ value: 'not_run', label: 'No new run' });
});
it('shows a recorded completion but retains task-settlement and stale-checkpoint uncertainty', () => {
  const flow = { id: 'deep-research', status: 'completed' };
  expect(taskFlowState({ ...task, flow }, 'completed')).toMatchObject({
    value: 'completed',
    label: 'Completed',
  });
  expect(taskFlowState({ ...task, flow }, 'failed')?.value).toBe('degraded');
  expect(taskFlowState({ ...task, flow: { ...flow, status: 'running' } }, 'completed')?.value).toBe(
    'unknown',
  );
});
