import type { ToolInvocation } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { withTaskWaitPresentation } from './task-wait-presentation';

describe('retained task wait receipts', () => {
  const result = { pending: ['child'], results: [], errors: [], timed_out: true };
  const tool: ToolInvocation = {
    id: 'wait',
    session_id: 'parent',
    name: 'wait_tasks',
    state: 'succeeded',
    input: { tasks: 'child', return_when: 'all', timeout_s: 0 },
    presentation: { summary: '0 task outcomes', blocks: [] },
    output: result,
  };

  it.each([result, [{ type: 'text', text: JSON.stringify(result) }]])(
    'explains pending native and legacy text receipts',
    (output) => {
      const shown = withTaskWaitPresentation({ ...tool, output });
      expect(shown.presentation?.action).toBe('Check all tasks');
      expect(shown.presentation?.summary).toBe('1 pending, 0 results collected');
      expect(shown.presentation?.blocks[0]).toMatchObject({ text: 'child' });
      expect(shown.presentation?.blocks[2]).toMatchObject({
        result_kind: 'snapshot',
        status: 'pending',
      });
      expect(shown.output).toBe(output);
    },
  );

  it('does not replace an unreadable result with a fabricated outcome', () => {
    const unreadable = { ...tool, output: [{ type: 'text', text: 'truncated' }] };
    const shown = withTaskWaitPresentation(unreadable);
    expect(shown.output).toBe(unreadable.output);
    expect(shown.presentation?.blocks.some((block) => block.result_kind === 'completion')).toBe(
      false,
    );
  });

  it('preserves current server-authored presentation', () => {
    const current = {
      ...tool,
      presentation: {
        action: 'Wait for all tasks',
        subject: 'wait-targets',
        summary: 'Pending',
        blocks: [],
      },
    };
    expect(withTaskWaitPresentation(current)).toBe(current);
  });

  it('shows any policy, selected handles, collected output and pending snapshots', () => {
    const shown = withTaskWaitPresentation({
      ...tool,
      input: { tasks: ['ready', 'child'], return_when: 'any' },
      output: {
        pending: ['child'],
        results: [
          {
            handle: 'ready',
            kind: 'Subagent',
            status: 'completed',
            result: { output: 'Audit incomplete.' },
          },
        ],
      },
    });
    expect(shown.presentation?.action).toBe('Wait for any task');
    expect(shown.presentation?.blocks[0].text).toBe('ready, child');
    expect(shown.presentation?.blocks[1].text).toContain('No deadline');
    expect(shown.presentation?.blocks[2]).toMatchObject({
      label: 'ready: Turn ended',
      text: 'Audit incomplete.',
    });
    expect(shown.presentation?.blocks[3].status).toBe('pending');
  });

  it('names an in-flight selection without fabricating completed results', () => {
    const shown = withTaskWaitPresentation({
      ...tool,
      state: 'running',
      output: undefined,
      input: { tasks: ['worker_a', 'worker_b'] },
    });
    expect(shown.presentation?.action).toBe('Wait for all tasks');
    expect(shown.presentation?.summary).toBe('0 task outcomes');
    expect(shown.presentation?.blocks.some((block) => block.result_kind)).toBe(false);
  });

  it('uses the authorized active wait label without changing handles or inventing answers', () => {
    const waiting = {
      ...tool,
      state: 'running' as const,
      output: undefined,
      input: { tasks: 'question_handle' },
      presentation: { summary: 'Waiting for your answer', blocks: [] },
    };
    const shown = withTaskWaitPresentation(waiting);
    expect(shown.presentation?.action).toBe('Waiting for your answer');
    expect(shown.presentation?.summary).toBe('Waiting for your answer');
    expect(shown.presentation?.blocks[0].text).toBe('question_handle');
    expect(shown.presentation?.blocks.some((block) => block.result_kind)).toBe(false);
    expect(shown.input).toBe(waiting.input);
    expect(shown.output).toBeUndefined();
    expect(
      withTaskWaitPresentation({ ...waiting, input: { tasks: 'question_handle', timeout_s: 0 } })
        .presentation?.action,
    ).toBe('Check all tasks');
  });

  it('exposes failed work and handle errors', () => {
    const shown = withTaskWaitPresentation({
      ...tool,
      output: {
        pending: [],
        results: [{ handle: 'child', status: 'failed', result: { output: 'Bad input' } }],
        errors: [{ handle: 'missing', error: 'Unknown task handle' }],
      },
    });
    expect(shown.presentation?.status).toBe('degraded');
    expect(shown.presentation?.summary).toBe('1 result collected, 1 unsuccessful, 1 error');
    expect(shown.presentation?.blocks.at(-1)).toMatchObject({
      severity: 'error',
      text: 'Unknown task handle',
    });
  });

  const canonical = {
    pending: ['uncertain', 'running'],
    outcomes: [
      {
        handle: 'ready',
        kind: 'Subagent',
        status: 'completed',
        pending: false,
        result: 'Finished',
      },
      { handle: 'uncertain', status: 'task_state_uncertain', reason: 'Cleanup is unconfirmed' },
      { handle: 'missing', error: 'Task unavailable' },
    ],
    timed_out: false,
  };

  it.each([
    canonical,
    [{ type: 'text', text: JSON.stringify(canonical) }],
    { structuredContent: canonical },
  ])('distinguishes canonical collection, attention, member errors and pending work', (output) => {
    const shown = withTaskWaitPresentation({
      ...tool,
      input: { tasks: ['ready', 'uncertain', 'missing', 'running'], return_when: 'any' },
      output,
    });
    expect(shown.output).toBe(output);
    expect(shown.presentation?.summary).toBe(
      '2 pending, 1 result collected, 1 task needs attention, 1 error',
    );
    expect(shown.presentation?.status).toBe('degraded');
    expect(shown.presentation?.blocks[2]).toMatchObject({
      label: 'ready: Completed',
      result_kind: 'completion',
      text: 'Finished',
    });
    expect(shown.presentation?.blocks[3]).toMatchObject({
      label: 'uncertain: Needs attention',
      result_kind: 'snapshot',
      severity: 'warning',
      text: 'Cleanup is unconfirmed',
      status: 'task_state_uncertain',
    });
    expect(shown.presentation?.blocks[4]).toMatchObject({
      label: 'missing: Could not collect',
      severity: 'error',
      text: 'Task unavailable',
    });
    expect(shown.presentation?.blocks[5]).toMatchObject({
      result_kind: 'snapshot',
      status: 'pending',
    });
  });
});
