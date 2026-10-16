import type { AsyncProcess, SubagentRun } from '@clio/core/v3';
import { expect, it } from 'vitest';
import { taskActivity } from './task-activity';

const child: SubagentRun = {
  id: 'child-run',
  session_id: 'parent',
  child_session_id: 'child-session',
  title: 'Worker',
  state: 'paused',
  task: 'Inspect the records',
};
const task: AsyncProcess = {
  id: 'child-run',
  handle: 'task_opaque',
  kind: 'agent',
  task_kind: 'Subagent',
  child_session_id: 'child-session',
  title: 'Worker',
  live_state: 'paused',
  status: 'paused',
  metadata: {},
};

it('joins the child conversation and durable task into one canonical row', () => {
  expect(taskActivity([task], [child])).toEqual([
    { key: 'task_opaque', process: task, subagent: child },
  ]);
});

it('retains legacy children without manufacturing task controls', () => {
  expect(taskActivity([], [child])).toEqual([{ key: 'child:child-run', subagent: child }]);
});

it('does not join by matching titles, cross-kind IDs, or ambiguous identities', () => {
  const different = { ...child, id: 'other', child_session_id: 'other-session' };
  expect(taskActivity([task], [different])).toHaveLength(2);
  expect(taskActivity([{ ...task, kind: 'mcp-task', task_kind: 'MCP' }], [child])).toHaveLength(2);
  expect(
    taskActivity([task], [child, { ...child, task: 'Conflicting duplicate identity' }]),
  ).toHaveLength(3);
});

it('pins an exact assignment even when a successor shares its stable conversation', () => {
  const successor = { ...child, id: 'successor-run' };
  const entries = taskActivity([task], [child, successor]);
  expect(entries).toHaveLength(2);
  expect(entries[0].subagent).toBe(child);
  expect(entries[1].subagent).toBe(successor);
});

it('uses a unique recorded legacy ID only when a child session identity is absent', () => {
  expect(taskActivity([{ ...task, child_session_id: undefined }], [child])[0].subagent).toBe(child);
  expect(taskActivity([{ ...task, child_session_id: 'different' }], [child])).toHaveLength(2);
});

it('keeps linked runs with distinct handles even when they share a conversation', () => {
  const next = { ...task, handle: 'task_successor', id: 'next-run' };
  expect(taskActivity([task, next], [child]).map((entry) => entry.key)).toEqual([
    'task_opaque',
    'task_successor',
  ]);
  expect(taskActivity([task, next], [child])[1].subagent).toBeUndefined();
});

it('does not attach a child conversation projection to a root assignment', () => {
  const root = { ...task, task_kind: 'Session' as const };
  const entries = taskActivity([root], [child]);
  expect(entries).toHaveLength(2);
  expect(entries[0].subagent).toBeUndefined();
});
