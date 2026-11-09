import type { ToolInvocation } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import '@/components/ai-elements/markdown';
import { ConversationTurn } from './conversation-turn';
import type { ConversationActivity, ConversationIteration } from './conversation-turn-model';

afterEach(cleanup);
function tool(id: string, title: string): ToolInvocation {
  return { id, session_id: 'session_1', name: id, title, state: 'succeeded' };
}
function activityLane(entries: readonly ConversationActivity[]): Partial<ConversationIteration> {
  return {
    activity: [...entries],
    tools: entries.flatMap((entry) => (entry.kind === 'tool' ? [entry.tool] : [])),
    tasks: [],
  };
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
describe('ConversationTurn activity lane', () => {
  function lane() {
    return screen.getByRole('group', { name: /^Activity:/u });
  }
  function rows() {
    return lane().querySelectorAll('[data-activity-row]');
  }

  it('keeps live and finished activity visible as rows, without a folding header', () => {
    const read = iteration(activityLane([{ kind: 'tool', id: 'read', tool: tool('read', 'Read') }]));
    const { rerender } = render(
      <ConversationTurn followLiveActivity iterations={[read]} mode="chain" subagents={{}} />,
    );
    expect(lane()).toHaveAttribute('aria-busy', 'true');
    expect(rows()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Activity/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Read: Result' })).not.toBeInTheDocument();

    rerender(<ConversationTurn answerStarted iterations={[read]} mode="chain" subagents={{}} />);

    expect(lane()).not.toHaveAttribute('aria-busy');
    expect(rows()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /^Activity/u })).not.toBeInTheDocument();
  });

  it('caps a long lane at its latest rows and opens the rest with Show all', () => {
    const entries: ConversationActivity[] = Array.from({ length: 8 }, (_, index) => ({
      kind: 'tool',
      id: `read_${index}`,
      tool: tool(`read_${index}`, `Read ${index}`),
    }));
    render(
      <ConversationTurn
        answerStarted
        iterations={[iteration(activityLane(entries))]}
        mode="chain"
        subagents={{}}
      />,
    );
    expect(rows()).toHaveLength(4);

    fireEvent.click(screen.getByRole('button', { name: 'Show all 8' }));

    expect(rows()).toHaveLength(8);
    expect(screen.queryByRole('button', { name: /^Show all/u })).not.toBeInTheDocument();
  });
});