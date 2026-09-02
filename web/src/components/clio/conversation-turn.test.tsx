import type { Task, ToolInvocation } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
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
              { kind: 'task', id: 'task_review', task: task('task_review', 'Review station quality') },
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
});
