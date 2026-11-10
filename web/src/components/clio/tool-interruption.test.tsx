import type { ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { ClioToolInvocation } from './tool-invocation';
import { ConversationTurn } from './conversation-turn';
import {
  getToolStatus,
  getToolInterruptionDetail,
  getToolFailureDetail,
} from './tool-presentation';
import { withTaskWaitInterruption } from './task-wait-presentation';
import { transcriptActivitySummary } from './transcript-activity-summary';
import type { ConversationIteration } from './conversation-turn-model';

afterEach(cleanup);

function wait(interrupted = 'mail_received'): ToolInvocation {
  return {
    id: 'wait',
    session_id: 's',
    name: 'wait_tasks',
    state: 'succeeded',
    input: { tasks: ['child'], return_when: 'all' },
    output: { outcomes: [], pending: ['child'], timed_out: false, interrupted },
    presentation: { summary: '', blocks: [] },
  };
}
function legacy(): ToolInvocation {
  const text = 'tool call completed after session cancellation';
  return {
    ...wait(),
    state: 'failed',
    error: 'Tool failed',
    output: [{ type: 'text', text }],
    presentation: {
      action: 'Wait',
      subject: 'wait-targets',
      summary: '',
      status: 'failed',
      blocks: [
        { id: 'wait-targets', type: 'text', text: 'child' },
        {
          id: 'wait-task-0',
          type: 'text',
          status: 'pending',
          result_kind: 'snapshot',
          text: 'Pending when this call returned.',
        },
        { id: 'execution-error', type: 'text', severity: 'error', text },
      ],
    },
  };
}
function iteration(tool: ToolInvocation): ConversationIteration {
  return {
    id: 'i',
    index: 0,
    agentId: 'main',
    thinking: [],
    nextThoughts: [],
    activity: [{ kind: 'tool', id: tool.id, tool }],
    tools: [tool],
    tasks: [],
    terminal: true,
    interrupted: true,
    streaming: false,
    summary: '',
  };
}

it.each([
  ['mail_received', 'Interrupted by mail'],
  ['stopped', 'Interrupted by a stop request'],
])('shows a stopped wait as one yellow stop icon with its %s reason on hover', (cause, reason) => {
  const tool = wait(cause);
  const before = JSON.stringify(tool);
  const view = render(<ClioToolInvocation compact tool={tool} />);
  expect(getToolStatus(tool)).toBe('interrupted');
  expect(getToolFailureDetail(tool)).toBeUndefined();
  const mark = view.container.querySelector('[data-slot="status-indicator"][data-tone="stopped"]');
  expect(mark?.querySelector('.text-warning')).not.toBeNull();
  expect(
    view.container.querySelectorAll('[data-slot="status-indicator"][data-tone="stopped"]'),
  ).toHaveLength(1);
  expect(view.container.querySelector('.text-destructive')).toBeNull();
  expect(screen.queryByText('Interrupted', { exact: true })).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: reason })).toHaveAttribute('title', reason);
  expect(JSON.stringify(tool)).toBe(before);
});
it('projects the exact retained cancellation marker without claiming mail or user attribution', () => {
  const tool = legacy();
  const before = JSON.stringify(tool);
  const shown = withTaskWaitInterruption(tool);
  expect(getToolStatus(tool)).toBe('interrupted');
  expect(getToolInterruptionDetail(shown)).toBe('Interrupted by session cancellation');
  expect(shown.presentation?.blocks.some((block) => block.id === 'execution-error')).toBe(false);
  expect(shown.presentation?.blocks.find((block) => block.id === 'wait-task-0')?.status).toBe(
    'pending',
  );
  expect(shown.output).toBe(tool.output);
  expect(JSON.stringify(tool)).toBe(before);
});
it('does not count or decorate an interrupted wait as a failed activity group', () => {
  const item = iteration(legacy());
  expect(transcriptActivitySummary([item])).toEqual({
    label: 'Used tools',
    running: false,
    failed: 0,
  });
  // Lanes never fold: the interrupted wait is a visible row.
  const view = render(<ConversationTurn iterations={[item]} mode="chain" subagents={{}} />);
  expect(view.container.querySelector('[data-slot="activity-failed-mark"]')).toBeNull();
  expect(
    view.container.querySelector('[data-slot="status-indicator"][data-tone="stopped"]'),
  ).not.toBeNull();
  expect(screen.queryByText('Interrupted', { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByText('failed', { exact: true })).not.toBeInTheDocument();
});
it('keeps an independent wait error failed even if its partial snapshot also mentions mail', async () => {
  const tool: ToolInvocation = {
    ...wait(),
    state: 'failed',
    error: 'Tool failed',
    presentation: {
      summary: '',
      status: 'failed',
      blocks: [
        {
          id: 'execution-error',
          type: 'text',
          severity: 'error',
          text: 'Task history is unavailable.',
        },
      ],
    },
  };
  expect(getToolStatus(tool)).toBe('failed');
  expect(getToolFailureDetail(tool)).toBe('Task history is unavailable.');
  const view = render(<ClioToolInvocation compact tool={tool} />);
  expect(screen.getByRole('img', { name: /^Failed/ })).toBeVisible();
  expect(
    view.container.querySelector('[data-slot="status-indicator"][data-tone="stopped"]'),
  ).toBeNull();
  expect(screen.getByRole('img', { name: /^Failed/ })).toHaveAttribute(
    'title',
    'Failed: Task history is unavailable.',
  );
});
it('does not reclassify another operation carrying the same recorder marker', () => {
  expect(getToolStatus({ ...legacy(), name: 'fs_write_file' })).toBe('failed');
});
it('retains unknown completion state even with an interruption-shaped receipt', () => {
  expect(getToolStatus({ ...legacy(), state: 'unknown' })).toBe('unknown');
});
it('uses an authored interruption cause in the noncompact row without a failure alert', () => {
  const tool: ToolInvocation = {
    ...wait(),
    state: 'failed',
    error: 'Tool failed',
    presentation: {
      summary: '',
      status: 'interrupted',
      diagnostic: 'Interrupted by user',
      blocks: [],
    },
  };
  render(<ClioToolInvocation tool={tool} />);
  expect(screen.getByRole('img', { name: 'Interrupted by user' })).toHaveAttribute(
    'title',
    'Interrupted by user',
  );
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
