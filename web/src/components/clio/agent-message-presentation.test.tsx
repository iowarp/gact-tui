import type { SubagentRun, ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import '@/components/ai-elements/markdown';
import { HarnessInjection } from './conversation-harness-injection';
import { ClioToolInvocation } from './tool-invocation';
import { ClioAgentMessageLine } from './subagent-card';
import { PresentationNavigation } from './presentation-navigation';
import { agentMessageName, withAgentMessagePresentation } from './agent-message-presentation';

afterEach(cleanup);

const child: SubagentRun = {
  id: 'task_review',
  session_id: 'parent',
  child_session_id: 'sess_reviewer',
  title: 'Evidence reviewer',
  agent_id: 'reviewer',
  state: 'running',
};
const children = { [child.id]: child };

it('names the actual received-message sender and expands the complete body on click', async () => {
  const body = 'The evidence is ready. Please inspect the **boundary conditions**.';
  const envelope = `[Agent session ${child.child_session_id}; peer; notification mail_reply]\n${JSON.stringify({ text: body, reply_to: 'mail_sent' })}`;
  render(
    <PresentationNavigation.Provider value={{ artifacts: {}, subagents: children }}>
      <HarnessInjection
        compact
        block={{ id: 'received', type: 'injection', source: 'peer', text: envelope }}
      />
    </PresentationNavigation.Provider>,
  );
  const row = screen.getByRole('button', { name: 'Received message from Evidence reviewer' });
  expect(row).toHaveAttribute('aria-expanded', 'false');
  expect(screen.queryByText(/The evidence is ready/)).toBeNull();
  await userEvent.click(row);
  expect(row).toHaveAttribute('aria-expanded', 'true');
  expect(await screen.findByText('boundary conditions')).toBeVisible();
  expect(screen.queryByText(/reply_to/)).toBeNull();
  await userEvent.click(
    screen.getByRole('button', {
      name: 'Technical details for Received message from Evidence reviewer',
    }),
  );
  expect(screen.getByRole('dialog').querySelector('pre')?.textContent).toBe(envelope);
});

it('uses exact peer identity and does not guess a name from the message or a similar session id', () => {
  expect(agentMessageName('sess_reviewer', children)).toBe('Evidence reviewer');
  expect(agentMessageName('task_review', children)).toBe('Evidence reviewer');
  expect(agentMessageName('sess_reviewer_other', children)).toBeUndefined();
  expect(agentMessageName('sess_parent', children, 'Parent planner')).toBe('Parent planner');
});

it('opens a retained sent message even when its recipient conversation is unavailable', async () => {
  render(
    <ClioAgentMessageLine
      block={{
        id: 'sent',
        type: 'agent_message',
        subagent_id: 'gone',
        label: 'Source analyst',
        message: 'Keep the original units and date range.',
      }}
    />,
  );
  const row = screen.getByRole('button', { name: 'Sent message to Source analyst' });
  expect(screen.queryByText('Keep the original units and date range.')).toBeNull();
  await userEvent.click(row);
  expect(await screen.findByText('Keep the original units and date range.')).toBeVisible();
});

it('expands the sent message before offering separate conversation navigation', async () => {
  const open = vi.fn();
  render(
    <ClioAgentMessageLine
      subagent={child}
      onOpen={open}
      block={{
        id: 'sent',
        type: 'agent_message',
        subagent_id: child.id,
        label: 'old label',
        message: 'Check both sources.',
      }}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Sent message to Evidence reviewer' }));
  expect(open).not.toHaveBeenCalled();
  expect(await screen.findByText('Check both sources.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Open conversation' }));
  expect(open).toHaveBeenCalledWith(child, 'canvas');
});

it('presents native outgoing calls with the recipient name and body while keeping exact details', async () => {
  const tool: ToolInvocation = {
    id: 'message-call',
    session_id: 'parent',
    name: 'send_agent_message',
    state: 'succeeded',
    input: { target: child.id, message: 'Inspect the original measurements.' },
    output: { accepted: true, session_id: child.child_session_id, message_id: 'mail_sent' },
  };
  render(
    <PresentationNavigation.Provider value={{ artifacts: {}, subagents: children }}>
      <ClioToolInvocation compact tool={tool} />
    </PresentationNavigation.Provider>,
  );
  expect(screen.queryByText('Inspect the original measurements.')).toBeNull();
  await userEvent.click(
    screen.getByRole('button', { name: 'Show result for Sent message to Evidence reviewer' }),
  );
  expect(await screen.findByText('Inspect the original measurements.')).toBeVisible();
  expect(
    withAgentMessagePresentation(
      { ...tool, state: 'failed', error: 'Recipient unavailable' },
      child.title,
    ).presentation?.action,
  ).toBe('Send message to Evidence reviewer');
  expect(tool.presentation).toBeUndefined();
});
