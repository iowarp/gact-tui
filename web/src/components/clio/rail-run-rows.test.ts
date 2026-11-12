import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { railRuns } from './rail-run-rows';

const task = (id: string, status: string, extra: Partial<AsyncProcess> = {}): AsyncProcess => ({
  id,
  kind: 'mcp-task',
  title: id,
  live_state: status as AsyncProcess['live_state'],
  status,
  metadata: {},
  ...extra,
});

it('orders needs-you, running and earlier runs and keeps only the actions each can take', () => {
  const runs = railRuns([
    task('done', 'completed'),
    task('export', 'running', { supported_actions: ['cancel'] }),
    task('broken', 'failed', { supported_actions: ['restart'], error_reason: 'Disk full' }),
  ]);
  expect(runs.map((run) => run.row.label)).toEqual(['broken', 'export', 'done']);
  const [broken, exporting, done] = runs;
  expect(broken).toMatchObject({ active: false, retryable: true });
  expect(broken!.row.statusReason).toBe('Disk full');
  expect(exporting).toMatchObject({ active: true, retryable: false });
  expect(exporting!.row).toMatchObject({ cancellable: true, source: 'mcp_task' });
  expect(done!.row.cancellable).toBe(false);
});

it('names flow runs by their task, marks requested stops and never guesses an unknown state', () => {
  const [flow, untitled, loop, stopping, odd] = railRuns([
    task('flow', 'running', { flow: { id: 'deep-research', status: 'running' } }),
    task('untitled', 'running', { title: '', flow: { id: 'deep-research', status: 'running' } }),
    task('loop', 'running', { kind: 'agent', flow: { id: 'react', status: 'unknown' } }),
    task('stopping', 'running', { cancel_requested: true, supported_actions: ['cancel'] }),
    task('odd', 'mystery'),
  ]);
  expect(flow!.row).toMatchObject({ source: 'flow', flowHandle: 'flow', label: 'flow' });
  expect(untitled!.row.label).toBe('Deep research run');
  // The agent loop is not a recorded flow run: the row opens its conversation.
  expect(loop!.row).toMatchObject({ source: 'agent_task', flowHandle: undefined });
  expect(stopping!.row).toMatchObject({ state: 'cancellation_requested', cancelRequested: true });
  expect(odd!.row.state).toBe('unknown');
  expect(odd!.active).toBe(true);
});

it('lists a child agent without a task record as an agent run', () => {
  const child: SubagentRun = {
    id: 'child',
    session_id: 'session',
    title: 'Researcher',
    state: 'running',
    task: 'Check sensors',
  };
  const [run] = railRuns([], [child]);
  expect(run!.row).toMatchObject({
    label: 'Researcher',
    assignment: 'Check sensors',
    source: 'agent_task',
    taskKind: 'Subagent',
  });
  expect(run!.active).toBe(true);
});
