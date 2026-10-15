import type { Message, ToolInvocation } from '@clio/core/v3';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ClioTurnWaitFeedback } from './turn-wait-feedback';

const user: Message = {
  id: 'user',
  session_id: 's',
  run_id: 'current',
  role: 'user',
  created_at: '2026-10-15T12:00:00Z',
  blocks: [],
};
const assistant: Message = {
  ...user,
  id: 'assistant',
  role: 'assistant',
  blocks: [{ id: 'tool', type: 'tool', tool_id: 'read' }],
};
const tool: ToolInvocation = {
  id: 'read',
  session_id: 's',
  name: 'fs_read_file',
  state: 'succeeded',
  input: {},
};
const props = {
  activeTurnId: 'current',
  activeTurnResponded: true,
  sessionState: 'running' as const,
  messages: [user, assistant],
  tools: { read: tool },
  tasks: {},
  subagents: {},
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-15T12:00:00Z'));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function tick() {
  act(() => vi.advanceTimersByTime(1000));
}

it('keeps a sustained gap after a completed tool visible without restarting preparation', () => {
  render(<ClioTurnWaitFeedback {...props} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  tick();
  expect(screen.getByRole('status')).toHaveTextContent('Waiting for response');
  expect(screen.getByText('1s')).toHaveAttribute('aria-hidden', 'true');
  tick();
  expect(screen.getByText('2s')).toBeVisible();
  expect(screen.queryByText(/Thinking|Setting up|queued by/i)).not.toBeInTheDocument();
});

it('leaves initial setup to the existing preparation indicator', () => {
  render(<ClioTurnWaitFeedback {...props} activeTurnResponded={false} messages={[user]} />);
  tick();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it.each(['text', 'reasoning'] as const)(
  'yields to visible streaming %s and resumes a later gap',
  (type) => {
    const { rerender } = render(<ClioTurnWaitFeedback {...props} />);
    tick();
    expect(screen.getByRole('status')).toBeVisible();
    const message: Message = {
      ...assistant,
      blocks: [{ id: 'live', type, text: 'Actual streamed text', streaming: true }],
    };
    rerender(<ClioTurnWaitFeedback {...props} messages={[user, message]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    message.blocks = [{ id: 'live', type, text: 'Recorded text', streaming: false }];
    rerender(<ClioTurnWaitFeedback {...props} messages={[user, message]} />);
    tick();
    expect(screen.getByText('1s')).toBeVisible();
  },
);

it.each(['pending', 'running'] as const)('does not duplicate a %s tool indicator', (state) => {
  render(<ClioTurnWaitFeedback {...props} tools={{ read: { ...tool, state } }} />);
  tick();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it.each([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'waiting_user',
  'waiting_permission',
] as const)('removes waiting feedback when the session is %s', (sessionState) => {
  const { rerender } = render(<ClioTurnWaitFeedback {...props} />);
  tick();
  rerender(<ClioTurnWaitFeedback {...props} sessionState={sessionState} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('ignores a previous run streaming while this run waits', () => {
  const previous: Message = {
    ...assistant,
    id: 'previous',
    run_id: 'previous',
    blocks: [{ id: 'old', type: 'reasoning', text: 'Old run', streaming: true }],
  };
  render(<ClioTurnWaitFeedback {...props} messages={[previous, user, assistant]} />);
  tick();
  expect(screen.getByRole('status')).toBeVisible();
});

it('shows observed infrastructure retries instead of implying model activity', () => {
  render(
    <ClioTurnWaitFeedback
      {...props}
      dependencies={[
        {
          id: 'web',
          session_id: 's',
          category: 'mcp',
          namespace: 'web',
          title: 'Web MCP',
          phase: 'retry',
          state: 'retrying',
          attempt: 2,
          max_attempts: 3,
          observed_active: true,
        },
      ]}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('retrying MCP Web');
  expect(screen.queryByText('Waiting for response')).not.toBeInTheDocument();
});

it('yields to task and child-agent progress already visible in the current response', () => {
  const { rerender } = render(
    <ClioTurnWaitFeedback
      {...props}
      messages={[user, { ...assistant, blocks: [{ id: 'task', type: 'task', task_id: 'job' }] }]}
      tasks={{ job: { id: 'job', session_id: 's', title: 'Research', state: 'running' } }}
    />,
  );
  tick();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  rerender(
    <ClioTurnWaitFeedback
      {...props}
      messages={[
        user,
        { ...assistant, blocks: [{ id: 'child', type: 'subagent', subagent_id: 'child' }] },
      ]}
      subagents={{ child: { id: 'child', session_id: 's', title: 'Researcher', state: 'running' } }}
    />,
  );
  tick();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
