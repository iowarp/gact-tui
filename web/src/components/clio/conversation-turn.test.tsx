import type { PendingInteraction, Task, ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ConversationTurn } from './conversation-turn';
import type { ConversationActivity, ConversationIteration } from './conversation-turn-model';

afterEach(cleanup);

function activityLane(entries: readonly ConversationActivity[]): Partial<ConversationIteration> {
  return {
    activity: [...entries],
    tools: entries.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : [])),
    tasks: entries.flatMap((entry) => (entry.kind === 'task' ? [entry.task] : [])),
  };
}

function tool(id: string, title: string): ToolInvocation {
  return { id, session_id: 'session_1', name: id, title, state: 'succeeded' };
}

function task(id: string, title: string, state: Task['state'] = 'completed'): Task {
  return { id, session_id: 'session_1', title, state };
}

function iteration(overrides: Partial<ConversationIteration> = {}): ConversationIteration {
  return {
    id: 'assistant_1:iteration:0',
    index: 0,
    agentId: 'main',
    thinking: [],
    nextThoughts: ['Resolve the region first.'],
    activity: [],
    tools: [],
    tasks: [],
    terminal: false,
    interrupted: false,
    streaming: false,
    summary: 'Resolve the region first.',
    ...overrides,
  };
}

describe('ConversationTurn incomplete state', () => {
  it('shows the interrupted state of a cancelled turn in full mode', () => {
    render(
      <ConversationTurn
        iterations={[iteration({ interrupted: true })]}
        mode="full"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Interrupted')).toBeVisible();
  });

  it('shows the interrupted state on the collapsed chain summary', () => {
    render(
      <ConversationTurn
        iterations={[iteration({ interrupted: true })]}
        mode="chain"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Interrupted')).toBeVisible();
  });

  it('does not mark a normally completed iteration as interrupted', () => {
    render(
      <ConversationTurn iterations={[iteration({ terminal: true })]} mode="full" subagents={{}} />,
    );

    expect(screen.queryByText('Interrupted')).not.toBeInTheDocument();
  });
});

describe('ConversationTurn correlated work placement', () => {
  it('renders tools and tasks in the wire order that links them', () => {
    render(
      <ConversationTurn
        iterations={[
          iteration(
            activityLane([
              { kind: 'tool', id: 'call_read', tool: tool('call_read', 'Read evidence file') },
              {
                kind: 'task',
                id: 'task_review',
                task: task('task_review', 'Review station quality'),
              },
              { kind: 'tool', id: 'call_render', tool: tool('call_render', 'Render the map') },
            ]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    const lane = screen.getByRole('region', { name: 'Full agent activity' });
    const rendered = [...lane.querySelectorAll('[data-turn-activity]')].map((node) =>
      node.getAttribute('data-turn-activity'),
    );
    expect(rendered).toEqual(['tool:call_read', 'task:task_review', 'tool:call_render']);
  });

  it('attaches the complete agent-routed exchange to its causal tool inside Activity', async () => {
    const user = userEvent.setup();
    const interaction: PendingInteraction = {
      id: 'question:agent_1',
      kind: 'question',
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      status: 'answered',
      title: 'Question from tool',
      requires_human_response: false,
      audience: 'agent',
      routing_state: 'elicitation_routed_to_agent',
      answered_by: 'agent',
      prompt: 'Which nonce did the user provide?',
      source: { protocol: 'mcp', invocation_id: 'call_read' },
      created_at: '2026-09-03T00:00:00Z',
      payload: {
        mode: 'form',
        request_index: 1,
        request_count: 1,
        answer_metadata: { nonce: 'browser-agent-9f42' },
        agent_answer_task: {
          task_id: 'task_answer',
          child_session_id: 'session_answer',
          status: 'completed',
          live_state: 'completed',
          created_at: '2026-09-03T00:00:00Z',
          updated_at: '2026-09-03T00:00:18.300Z',
        },
      },
      actions: [],
    };
    render(
      <ConversationTurn
        interactions={[interaction]}
        iterations={[
          iteration(
            activityLane([
              { kind: 'tool', id: 'call_read', tool: tool('call_read', 'Read evidence file') },
            ]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Form request 1 of 1 · Agent answered')).toBeVisible();
    expect(
      screen
        .getByText('Form request 1 of 1 · Agent answered')
        .closest('[data-turn-activity="tool:call_read"]'),
    ).not.toBeNull();
    await user.click(screen.getByRole('button', { name: /Read evidence file/i }));
    expect(screen.getByText('Form request 1 of 1')).toBeVisible();
    expect(screen.getByText('Which nonce did the user provide?')).toBeVisible();
    expect(screen.getByText('Agent prepared an answer')).toBeVisible();
    expect(screen.getByText('browser-agent-9f42')).toBeVisible();
    expect(screen.getByText('Validated by MCP schema')).toBeVisible();
    expect(screen.getByText('Answer returned to MCP')).toBeVisible();
    expect(screen.getByText('18.3 s')).toBeVisible();
    expect(screen.getByText('session_answer')).toBeVisible();
  });

  it('keeps a direct human MCP answer attached to its causal tool', async () => {
    const user = userEvent.setup();
    const interaction: PendingInteraction = {
      id: 'mcp_task_input:human_1',
      kind: 'mcp_task_input',
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      task_id: 'mcp_task_1',
      status: 'answered',
      title: 'MCP task input required',
      requires_human_response: false,
      answered_by: 'human',
      prompt: 'Pick a value',
      source: { protocol: 'mcp', invocation_id: 'call_read' },
      created_at: '2026-09-03T00:00:00Z',
      payload: {
        mode: 'form',
        request_index: 1,
        request_count: 1,
        answer_metadata: { value: 'human-visible-4d72' },
      },
      actions: [],
    };
    render(
      <ConversationTurn
        interactions={[interaction]}
        iterations={[
          iteration(
            activityLane([
              { kind: 'tool', id: 'call_read', tool: tool('call_read', 'Guarded Input') },
            ]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Form request 1 of 1 · Answered by you')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Guarded Input/i }));
    expect(screen.getByText('Pick a value')).toBeVisible();
    expect(screen.getByText('You answered')).toBeVisible();
    expect(screen.getByText('human-visible-4d72')).toBeVisible();
    expect(screen.getByText('Validated by MCP schema')).toBeVisible();
    expect(screen.getByText('Response returned to MCP')).toBeVisible();
  });

  it('keeps a native ask-user answer attached to the ask-user tool', async () => {
    const user = userEvent.setup();
    const interaction: PendingInteraction = {
      id: 'question:native_1',
      kind: 'question',
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      status: 'answered',
      title: 'Question from agent',
      requires_human_response: false,
      answered_by: 'human',
      prompt: 'Which physical system should I simulate?',
      source: { protocol: 'native', tool_name: 'ask_user', invocation_id: 'call_ask' },
      created_at: '2026-09-03T00:00:00Z',
      payload: { answer_metadata: { answer: 'A cantilever beam' } },
      actions: [],
    };
    render(
      <ConversationTurn
        interactions={[interaction]}
        iterations={[
          iteration(
            activityLane([{ kind: 'tool', id: 'call_ask', tool: tool('call_ask', 'Ask User') }]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Question · Answered by you')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Ask User/i }));
    expect(screen.getByText('Which physical system should I simulate?')).toBeVisible();
    expect(screen.getByText('A cantilever beam')).toBeVisible();
    expect(screen.getByText('Answer returned to agent')).toBeVisible();
    expect(screen.queryByText('Validated by MCP schema')).not.toBeInTheDocument();
    expect(screen.queryByText('Response returned to MCP')).not.toBeInTheDocument();
  });

  it('keeps an agent failure in the causal tool after routing the request to the human', async () => {
    const user = userEvent.setup();
    const interaction: PendingInteraction = {
      id: 'question:fallback',
      kind: 'question',
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      status: 'pending',
      title: 'Question from tool',
      requires_human_response: true,
      audience: 'agent',
      routing_state: 'agent_elicitation_fallback_to_human',
      fallback_detail: 'agent_answer_schema_invalid',
      prompt: 'Choose a valid sample count',
      source: { protocol: 'mcp', invocation_id: 'call_read' },
      created_at: '2026-09-03T00:00:00Z',
      payload: {
        mode: 'form',
        request_index: 2,
        request_count: 2,
        agent_answer_task: { status: 'completed', live_state: 'completed' },
      },
      actions: ['answer', 'cancel'],
    };
    render(
      <ConversationTurn
        interactions={[interaction]}
        iterations={[
          iteration(
            activityLane([
              { kind: 'tool', id: 'call_read', tool: tool('call_read', 'Read evidence file') },
            ]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Form request 2 of 2 · Needs your response')).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Read evidence file/i }));
    expect(screen.getByText('Answer rejected by MCP schema')).toBeVisible();
    expect(screen.getByText('Routed to you')).toBeVisible();
    expect(screen.getByText('Technical details')).toBeVisible();
  });

  it('shows that a human-resolved fallback returned to MCP instead of still needing attention', async () => {
    const user = userEvent.setup();
    const interaction: PendingInteraction = {
      id: 'question:fallback-resolved',
      kind: 'question',
      owner_session_id: 'session_1',
      attended_session_id: 'session_1',
      status: 'answered',
      title: 'Question from tool',
      requires_human_response: false,
      audience: 'agent',
      answered_by: 'human',
      routing_state: 'agent_elicitation_fallback_to_human',
      fallback_detail: 'policy_denied_server',
      prompt: 'Which nonce did the user provide?',
      source: { protocol: 'mcp', invocation_id: 'call_read' },
      created_at: '2026-09-03T00:00:00Z',
      payload: {
        mode: 'form',
        request_index: 1,
        request_count: 1,
        answer_metadata: { nonce: 'human-fallback-7c31' },
      },
      actions: [],
    };
    render(
      <ConversationTurn
        interactions={[interaction]}
        iterations={[
          iteration(
            activityLane([
              { kind: 'tool', id: 'call_read', tool: tool('call_read', 'Read evidence file') },
            ]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    expect(screen.getByText('Form request 1 of 1 · Answered by you')).toBeVisible();
    expect(screen.queryByText('Form request 1 of 1 · Needs your response')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Read evidence file/i }));
    expect(screen.getByText('You answered')).toBeVisible();
    expect(screen.getByText('human-fallback-7c31')).toBeVisible();
    expect(screen.getByText('Answer returned to MCP')).toBeVisible();
    expect(screen.queryByText('Routed to you')).not.toBeInTheDocument();
  });
});

describe('ConversationTurn announced state', () => {
  it('announces a task state in words rather than its protocol identifier', () => {
    render(
      <ConversationTurn
        iterations={[
          iteration(
            activityLane([
              {
                kind: 'task',
                id: 'task_permission',
                task: task('task_permission', 'Deploy the bundle', 'waiting_permission'),
              },
            ]),
          ),
        ]}
        mode="chain"
        subagents={{}}
      />,
    );

    const disclosure = screen.getByRole('button', { name: /Expand activity/ });
    expect(disclosure).toHaveAccessibleName(/Permission needed/);
    expect(disclosure).not.toHaveAccessibleName(/waiting_permission/);
  });

  it('exposes a task detail as readable content instead of naming a bare span', () => {
    render(
      <ConversationTurn
        iterations={[
          iteration(
            activityLane([
              {
                kind: 'task',
                id: 'task_detail',
                task: {
                  ...task('task_detail', 'Review station quality'),
                  detail: 'Evidence retained with source identity.',
                },
              },
            ]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    const line = document.querySelector('[data-turn-activity="task:task_detail"]');
    expect(line).not.toBeNull();
    expect(line).not.toHaveAttribute('aria-label');
    expect(line).toHaveTextContent('Review station quality');
    expect(line).toHaveTextContent('Completed');
    expect(line).toHaveTextContent('Evidence retained with source identity.');
  });

  it('does not leave a task with no detail as an unexplained status row', () => {
    render(
      <ConversationTurn
        iterations={[
          iteration(
            activityLane([
              {
                kind: 'task',
                id: 'task_without_detail',
                task: task('task_without_detail', 'Review station quality'),
              },
            ]),
          ),
        ]}
        mode="full"
        subagents={{}}
      />,
    );

    const line = document.querySelector('[data-turn-activity="task:task_without_detail"]');
    expect(line).toHaveTextContent('No detail reported');
  });
});
