import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { withTaskWaitInterruption } from './task-wait-presentation';
import { toolOperation } from './tool-operation';
import { withOperationOutcome } from './tool-operation-outcome';

const tool: ToolInvocation = {
  id: 'wait',
  session_id: 'parent',
  name: 'wait_tasks',
  state: 'succeeded',
  input: { tasks: 'child', timeout_s: 0 },
  presentation: { summary: '0 task outcomes', blocks: [] },
};
const pending = { pending: ['child'], results: [], errors: [], timed_out: true };
describe('retained wait receipts through the shared operation reader', () => {
  it.each([pending, [{ type: 'text', text: JSON.stringify(pending) }]])(
    'keeps pending waits closed without mutating the receipt',
    (output) => {
      const recorded = { ...tool, output };
      const shown = withTaskWaitInterruption(recorded);
      expect(shown).toBe(recorded);
      expect(toolOperation(shown)).toMatchObject({
        action: 'Check',
        metadata: '0 returned, 1 running',
        expandable: false,
        tasks: [],
      });
      expect(shown.output).toBe(output);
    },
  );
  it("shows a child agent's answer as its report, not its run's JSON", () => {
    const run = {
      selected_expert: 'explore',
      route_source: 'flow:react',
      answer: 'The folder holds one file, notes.txt.',
      tools_called: [{ name: 'fs_list_directory', ok: true }],
    };
    const shown = toolOperation({
      ...tool,
      input: { tasks: ['child'] },
      output: {
        pending: [],
        results: [{ handle: 'child', kind: 'Session', status: 'completed', result: run }],
        errors: [],
      },
    });
    expect(shown.tasks?.map((task) => task.value)).toEqual([
      'The folder holds one file, notes.txt.',
    ]);
  });

  it('never fabricates an answer from an unreadable receipt', () => {
    const recorded = { ...tool, output: [{ type: 'text', text: 'truncated' }] };
    const shown = toolOperation(recorded);
    expect(shown.tasks).toEqual([]);
    expect(shown.expandable).toBe(false);
    expect(recorded.output[0].text).toBe('truncated');
  });
  it('preserves server-authored fields and exact input/output', () => {
    const recorded = {
      ...tool,
      presentation: {
        action: 'Wait for all tasks',
        subject: 'wait-targets',
        summary: 'Pending',
        blocks: [],
      },
    };
    expect(withTaskWaitInterruption(recorded)).toBe(recorded);
  });
  it('shows collected content only, while identifying selected and pending tasks', () => {
    const shown = toolOperation({
      ...tool,
      input: { tasks: ['ready', 'child'], return_when: 'any' },
      output: {
        pending: ['child'],
        results: [
          { handle: 'ready', status: 'completed', result: { output: 'Audit incomplete.' } },
        ],
      },
    });
    expect(shown.subjects.map((row) => row.label)).toEqual(['ready', 'child']);
    expect(shown.metadata).toBe('1 returned, 1 running');
    expect(shown.tasks).toHaveLength(1);
    expect(shown.tasks?.[0].value).toBe('Audit incomplete.');
  });
  it('names an in-flight selection without mounting an empty result', () => {
    const shown = toolOperation({
      ...tool,
      state: 'running',
      input: { tasks: ['worker_a', 'worker_b'] },
    });
    expect(shown.subjects.map((row) => row.label)).toEqual(['worker_a', 'worker_b']);
    expect(shown.expandable).toBe(false);
    expect(shown.tasks).toEqual([]);
  });
  it('retains an active answer-wait label while immediate checks stay distinct', () => {
    const waiting = {
      ...tool,
      state: 'running' as const,
      input: { tasks: 'question_handle' },
      presentation: { summary: 'Waiting for your answer', blocks: [] },
    };
    expect(toolOperation(waiting).action).toBe('Waiting for your answer');
    expect(toolOperation(waiting).tasks).toEqual([]);
    expect(toolOperation({ ...waiting, input: { ...waiting.input, timeout_s: 0 } }).action).toBe(
      'Check',
    );
  });
  it('exposes both failed returned work and unavailable handles', () => {
    const recorded = {
      ...tool,
      output: {
        pending: [],
        results: [{ handle: 'child', status: 'failed', result: { output: 'Bad input' } }],
        errors: [{ handle: 'missing', error: 'Unknown task handle' }],
      },
    };
    const shown = toolOperation(recorded);
    expect(withOperationOutcome(recorded).presentation?.status).toBe('degraded');
    expect(shown.metadata).toBe('1 returned, 1 unsuccessful, 1 unavailable');
    expect(shown.tasks?.[0]).toMatchObject({ value: 'Bad input', error: 'Task failed' });
    expect(shown.tasks?.[1].error).toBe('Unknown task handle');
  });
  const canonical = {
    pending: ['uncertain', 'running'],
    outcomes: [
      { handle: 'ready', status: 'completed', result: 'Finished' },
      { handle: 'uncertain', status: 'task_state_uncertain', reason: 'Cleanup is unconfirmed' },
      { handle: 'missing', error: 'Task unavailable' },
    ],
  };
  it.each([
    canonical,
    [{ type: 'text', text: JSON.stringify(canonical) }],
    { structuredContent: canonical },
  ])('keeps uncertainty separate from completed content and handle failures', (output) => {
    const recorded = {
      ...tool,
      input: { tasks: ['ready', 'uncertain', 'missing', 'running'] },
      output,
    };
    const shown = toolOperation(recorded);
    expect(recorded.output).toBe(output);
    expect(withOperationOutcome(recorded).presentation?.status).toBe('degraded');
    expect(shown.metadata).toBe('1 returned, 1 running, 1 needs attention, 1 unavailable');
    expect(shown.tasks).toHaveLength(2);
    expect(shown.tasks?.[0].value).toBe('Finished');
    expect(shown.tasks?.[1].error).toBe('Task unavailable');
    expect(shown.tasks?.some((row) => row.key === 'uncertain')).toBe(false);
  });
});
